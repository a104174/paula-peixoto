# Paula Peixoto

Website público, reservas e backoffice privado, construídos com Next.js/vinext
para Cloudflare Workers. Os dados persistentes vivem numa base de dados
Cloudflare D1 ligada como `DB`.

## Arquitetura de autenticação

O backoffice usa contas administrativas próprias com email normalizado e
password. Não existe autenticação ChatGPT, password global ou bypass de
desenvolvimento.

- `admin_users`: contas individuais, roles `owner`/`admin`, estado e hash
  `scrypt` da password.
- `admin_sessions`: sessões persistentes; guarda somente SHA-256 do token.
- `admin_login_attempts`: rate limiting distribuído por IP + email.
- `admin_password_reset_tokens`: estrutura reservada para recuperação por email.
- Cookie `paula_admin_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`
  em produção e validade absoluta de 12 dias.

O runtime de produção é um Cloudflare Worker, não um servidor Node.js
tradicional. O projeto tem `nodejs_compat`, que permite usar o `scrypt` nativo
de `node:crypto`. D1 guarda reservas, administradores, sessões e contadores de
rate limit. Não se deve usar memória do processo ou o filesystem do Worker para
dados persistentes.

## Preparação local

Requisitos: Node.js `>=22.13.0`.

```bash
npm install
npm run db:migrate
npm run admin:create
npm run dev
```

`admin:create` pede email, nome e password sem mostrar a password no terminal.
Por omissão, os comandos D1 atuam na base local em `.wrangler/state`.

## Produção

Antes do primeiro deploy da versão com autenticação, aplique as migrations à
mesma D1 ligada ao site. Obtenha o ID e o nome da base no painel Cloudflare:

```bash
ADMIN_D1_DATABASE_ID="<id-d1>" \
ADMIN_D1_DATABASE_NAME="<nome-d1>" \
npm run db:migrate -- --remote

ADMIN_D1_DATABASE_ID="<id-d1>" \
ADMIN_D1_DATABASE_NAME="<nome-d1>" \
npm run admin:create -- --remote
```

O segundo comando pede a password interativamente. Em CI sem TTY, também aceita
`ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME` e `ADMIN_PASSWORD` apenas no ambiente do
processo. Nunca coloque esses valores num ficheiro versionado, histórico de
shell ou configuração do Worker.

Não há variáveis de ambiente de autenticação necessárias em runtime. A binding
D1 `DB` declarada em `.openai/hosting.json` é obrigatória.

Depois, abra `/admin/login`. Uma conta criada pelo script de bootstrap é
`owner`; contas futuras criadas por uma área de gestão devem começar com
`must_change_password=1`.

## Backoffice e migration de agenda

A migration `drizzle/0002_backoffice_calendar.sql` acrescenta:

- `customers`, com nome, telefone, email, notas e datas de auditoria;
- `business_services`, com duração, preço, cor, ordem e estado ativo;
- `customer_id` e `duration_minutes` às marcações existentes.

A migration importa clientes já presentes nas reservas, agrupando-os por
telefone, associa as marcações históricas e preenche a duração a partir do
serviço conhecido. Os campos de nome, contacto e serviço continuam guardados
na própria marcação como snapshot histórico.

Deve ser aplicada com o mesmo comando utilizado para as migrations de
autenticação:

```bash
npm run db:migrate

# Produção
ADMIN_D1_DATABASE_ID="<id-d1>" \
ADMIN_D1_DATABASE_NAME="<nome-d1>" \
npm run db:migrate -- --remote
```

O backoffice abre na agenda diária e oferece vista semanal, navegação de
períodos, pesquisa e filtros. Os slots partem da configuração de horários já
existente e das horas reais das marcações; o calendário não assume dias úteis
ou um intervalo rígido. Conflitos são avisados, mas um administrador pode
confirmar explicitamente a sobreposição.

Serviços inativos deixam de aparecer em novas reservas no backoffice e no
website, mas o nome, duração e histórico das marcações anteriores permanecem.

## Rotas e proteção

- Públicas: `/`, `/api/availability` e `POST /api/appointments`.
- Autenticação: `/admin/login`, `/api/auth/login`, `/api/auth/logout`,
  `/api/auth/session` e `/admin/change-password`.
- Protegidas: `/admin`, `/admin/change-password` e todas as rotas
  `/api/admin/*`.

`requireAdmin()` protege páginas e `requireAdminApi()` protege APIs. Operações
mutáveis validam `Origin`/`Referer`; respostas administrativas usam
`Cache-Control: no-store`. O endpoint público de reservas só cria marcações,
valida limites de input e aplica rate limiting D1. Não existe endpoint público
para alterar ou eliminar reservas.

## Sessões e recuperação operacional

Terminar sessão faz `POST /api/auth/logout`, revoga a sessão na D1 e apaga o
cookie. Alterar a password revoga todas as sessões e exige novo login. Para
revogar manualmente todas as sessões de uma conta:

```sql
UPDATE admin_sessions
SET revoked_at = datetime('now')
WHERE user_id = (SELECT id FROM admin_users WHERE email = 'owner@exemplo.pt')
  AND revoked_at IS NULL;
```

Se o owner perder a password, execute o procedimento administrativo abaixo.
Todas as sessões são revogadas e a nova password terá de ser novamente alterada
depois do login:

```bash
ADMIN_D1_DATABASE_ID="<id-d1>" \
ADMIN_D1_DATABASE_NAME="<nome-d1>" \
ADMIN_EMAIL="owner@exemplo.pt" \
ADMIN_PASSWORD="<password-temporária-forte>" \
npm run admin:reset-password -- --remote
```

O envio de email transacional permanece desativado. Por isso não foi publicado
um fluxo de “esqueci-me da password” que pudesse expor tokens. A tabela para
tokens de utilização única e curta duração está preparada; o fluxo só deve ser
ativado quando houver envio de email real.

## Email transacional preparado (envio desativado)

O módulo central em `lib/email` suporta os providers `disabled` e `resend`.
Por omissão, e enquanto não existir uma conta Resend, use:

```dotenv
EMAIL_ENABLED=false
EMAIL_PROVIDER=disabled
RESEND_API_KEY=
EMAIL_FROM=Paula Peixoto <marcacoes@seudominio.pt>
PAULA_NOTIFICATION_EMAIL=
APP_URL=https://seudominio.pt
RESEND_WEBHOOK_SECRET=
```

Com `EMAIL_ENABLED=false`, o sistema nunca contacta a Resend. Os eventos
aplicáveis são renderizados e registados em `email_outbox` com estado
`disabled`, tentativas `0` e uma chave de idempotência única. A interface
pública confirma apenas que o pedido de marcação foi recebido; não afirma que
um email foi enviado.

A migration `drizzle/0003_transactional_email.sql` cria:

- `email_outbox`, que guarda destinatário, tipo, estado, tentativas, erro,
  conteúdo renderizado, IDs do provider e associação à marcação;
- `email_webhook_events`, que deduplica webhooks através do header `svix-id`.

Para ver todos os templates durante desenvolvimento:

```bash
cp .dev.vars.example .dev.vars
npm run dev
# abrir http://localhost:3000/email-preview
```

A página de preview não está disponível em produção e nunca envia mensagens.
Existem versões HTML e texto para pedido recebido, novo pedido para a Paula,
confirmação, reagendamento e cancelamento.

### Ativação futura com Resend

1. Criar a conta Resend, verificar o domínio remetente e aplicar a migration
   `0003_transactional_email` à D1 de produção.
2. Configurar `RESEND_API_KEY` e `RESEND_WEBHOOK_SECRET` como secrets do Worker.
   Configurar as restantes variáveis como valores de runtime; não as colocar
   no repositório.
3. Registar na Resend o webhook HTTPS
   `https://seudominio.pt/api/webhooks/resend`. O endpoint valida o corpo raw,
   os headers `svix-*`, a janela temporal da assinatura e eventos repetidos.
4. Definir um remetente do domínio verificado em `EMAIL_FROM`, o email da Paula
   em `PAULA_NOTIFICATION_EMAIL`, o URL canónico em `APP_URL` e então alterar:

```dotenv
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
```

As chamadas a `POST /emails` usam `Idempotency-Key`. A outbox mantém uma
segunda proteção local e regista aceitação, entrega, atraso ou falha comunicada
pelo webhook. Falhas de email nunca revertem uma marcação já guardada.

## Gestão de administradores

O schema, roles, revogação por utilizador e guardas `owner` estão preparados,
mas a interface `/admin/administradores` não foi incluída nesta primeira fase.
Ao implementá-la, todas as mutações devem usar `requireAdminApi({ role:
"owner" })`, preservar pelo menos um owner ativo e impedir auto-desativação.

## Disponibilidade configurável

A migration `drizzle/0004_configurable_availability.sql` acrescenta três
tabelas:

- `availability_settings`, com antecedência mínima, horizonte máximo, pausa
  entre marcações e passo de geração dos horários;
- `availability_work_periods`, com zero ou vários períodos por dia da semana;
- `availability_blocks`, para bloqueios horários pontuais e intervalos de dias
  completos, incluindo férias.

A configuração é editada em **Backoffice → Definições → Disponibilidade**. Um
dia sem períodos é considerado fechado. Os intervalos do mesmo dia não podem
sobrepor-se e bloqueios horários só podem abranger um único dia; para vários
dias deve usar-se “Férias / dias”.

Enquanto não existir a linha `default` em `availability_settings`, a API
pública mantém os horários históricos de `lib/services.ts`. Depois do primeiro
“Guardar disponibilidade”, os slots passam a ser calculados a partir dos
períodos semanais, bloqueios, antecedência, horizonte, marcações não canceladas,
duração do serviço e pausa entre marcações. A rota administrativa
`/api/admin/availability` exige a sessão e a proteção de origem/CSRF já usadas
no restante backoffice.

## Verificação

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --audit-level=high
```
