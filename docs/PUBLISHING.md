# Guia de Publicação de Novas Versões

Este documento descreve como publicar novas versões dos três pacotes deste monorepo após realizar atualizações.

---

## Visão Geral dos Pacotes

| Pacote | Registry | Caminho |
|---|---|---|
| `@haocruz/opentelemetry` | npm | `packages/node/` |
| `@haocruz/opentelemetry-web` | npm | `packages/web/` |
| `haoc/opentelemetry-laravel` | Packagist | `packages/laravel/` |

---

## 1. Antes de Publicar — Verificação

Antes de qualquer publicação, confirme quais pacotes têm mudanças não publicadas desde a última versão lançada:

```bash
# Identifica o commit da última publicação e lista mudanças por pacote
# (substitua os SHAs pelo último commit presente no npm/Packagist)
git log <ULTIMO_SHA_NODE>..HEAD --oneline -- packages/node/
git log <ULTIMO_SHA_WEB>..HEAD --oneline -- packages/web/
git log <ULTIMO_SHA_LARAVEL>..HEAD --oneline -- packages/laravel/
```

Para consultar a última versão publicada de cada pacote:

```bash
# npm
curl -s https://registry.npmjs.org/@haocruz/opentelemetry/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'], '—', d.get('gitHead',''))"
curl -s https://registry.npmjs.org/@haocruz/opentelemetry-web/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'], '—', d.get('gitHead',''))"

# Packagist
curl -s https://packagist.org/packages/haoc/opentelemetry-laravel.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('versions:', list(d.get('package',{}).get('versions',{}).keys())[:5])"
```

---

## 2. Tipo de Versão (SemVer)

| Tipo de mudança | Bump |
|---|---|
| `BREAKING CHANGE` no commit body | **major** (X.0.0) |
| `feat(...)` — nova funcionalidade | **minor** (1.X.0) |
| `fix(...)` / `refactor` / `test` / `docs` / `chore` | **patch** (1.0.X) |

> Usa-se Conventional Commits: `type(scope): mensagem`

---

## 3. Publicar Pacotes npm

### 3.1 — Bump da versão

Edite `packages/node/package.json` e/ou `packages/web/package.json`:

```json
"version": "X.Y.Z"
```

### 3.2 — Login no npm (se necessário)

```bash
export PATH="/home/japostulo/.nvm/versions/node/v20.10.0/bin:$PATH"
npm whoami   # deve retornar "japostulo"

# Se não estiver logado:
npm login    # abre browser para autenticação
```

> **IMPORTANTE (WSL2):** sempre usar o npm do nvm, NUNCA o npm do Windows  
> (`/mnt/c/Program Files/nodejs/npm`). O npm do Windows causa erro `EISDIR`  
> ao criar symlinks no sistema de arquivos Linux.

### 3.3 — Publicar @haocruz/opentelemetry

```bash
cd packages/node
npm publish --access=public
# o script prepublishOnly executa clean + build automaticamente
```

### 3.4 — Publicar @haocruz/opentelemetry-web

```bash
cd packages/web
npm publish --access=public
```

### 3.5 — Verificar no registry

```bash
curl -s https://registry.npmjs.org/@haocruz/opentelemetry/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])"
curl -s https://registry.npmjs.org/@haocruz/opentelemetry-web/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])"
```

---

## 4. Publicar haoc/opentelemetry-laravel (Packagist)

O Packagist não lê diretamente este monorepo — ele lê o repositório espelho  
`github.com/japostulo/opentelemetry-laravel`.  
A publicação é feita sincronizando `packages/laravel/` para esse espelho e criando uma tag de versão.

### 4.1 — Atualizar versão no package.json stub

Edite `packages/laravel/package.json` (arquivo privado, usado apenas pelo semantic-release):

```json
"version": "X.Y.Z"
```

### 4.2 — Clonar o espelho e sincronizar

```bash
git clone git@github.com:japostulo/opentelemetry-laravel.git /tmp/laravel-release
cd /tmp/laravel-release

# Configurar identidade Git (na primeira vez por máquina)
git config user.email "joao.212009@hotmail.com"
git config user.name "japostulo"
```

```bash
# Sincronizar conteúdo de packages/laravel/ para o espelho
# (executar a partir da raiz do monorepo)
rsync -av --delete \
  --exclude='.git' \
  --exclude='.releaserc.json' \
  --exclude='package.json' \
  --exclude='.release-version' \
  --exclude='node_modules/' \
  --exclude='vendor/' \
  packages/laravel/ /tmp/laravel-release/
```

### 4.3 — Verificar e commitar

```bash
cd /tmp/laravel-release
git status --short

git add -A
git commit -m "feat(laravel): release vX.Y.Z — <breve descrição>"
```

### 4.4 — Criar tag e push

```bash
# Tags com prefixo "v" são obrigatórias para Packagist reconhecer versões estáveis
git tag vX.Y.Z
git push origin master
git push origin vX.Y.Z
```

> Também pode criar a tag sem prefixo como backup: `git tag X.Y.Z && git push origin X.Y.Z`

### 4.5 — Verificar no Packagist

```bash
# Aguardar ~30s para o webhook disparar
sleep 30
curl -s https://packagist.org/packages/haoc/opentelemetry-laravel.json \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('versions:', list(d.get('package',{}).get('versions',{}).keys())[:8])"
```

### 4.6 — Limpar

```bash
rm -rf /tmp/laravel-release
```

---

## 5. Fluxo Completo (Quick Reference)

```bash
# ─── CONFIGURAÇÃO INICIAL ─────────────────────────────────────────────────────
export PATH="/home/japostulo/.nvm/versions/node/v20.10.0/bin:$PATH"
npm whoami  # confirmar login npm

# ─── BUMP DE VERSÕES ──────────────────────────────────────────────────────────
# Editar package.json de cada pacote que mudou:
# packages/node/package.json   → "version": "X.Y.Z"
# packages/web/package.json    → "version": "X.Y.Z"
# packages/laravel/package.json → "version": "X.Y.Z"

# ─── PUBLICAR npm ─────────────────────────────────────────────────────────────
(cd packages/node && npm publish --access=public)
(cd packages/web && npm publish --access=public)

# ─── PUBLICAR Packagist ───────────────────────────────────────────────────────
NEW_VERSION="X.Y.Z"
git clone git@github.com:japostulo/opentelemetry-laravel.git /tmp/laravel-release
rsync -av --delete \
  --exclude='.git' --exclude='.releaserc.json' --exclude='package.json' \
  --exclude='.release-version' --exclude='node_modules/' --exclude='vendor/' \
  packages/laravel/ /tmp/laravel-release/

cd /tmp/laravel-release
git config user.email "joao.212009@hotmail.com"
git config user.name "japostulo"
git add -A
git commit -m "feat(laravel): release v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin master
git push origin "v${NEW_VERSION}"
cd /home/japostulo/projects/totem/haoc-opentelemetry
rm -rf /tmp/laravel-release

# ─── VERIFICAR ────────────────────────────────────────────────────────────────
curl -s https://registry.npmjs.org/@haocruz/opentelemetry/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print('@haocruz/opentelemetry:', d['version'])"
curl -s https://registry.npmjs.org/@haocruz/opentelemetry-web/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print('@haocruz/opentelemetry-web:', d['version'])"
sleep 15 && curl -s https://packagist.org/packages/haoc/opentelemetry-laravel.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('packagist:', list(d.get('package',{}).get('versions',{}).keys())[:5])"
```

---

## 6. Checklist Pré-Release

- [ ] Rodou os testes: `npm test` na raiz (cobertura do node/web) e `composer test` em `packages/laravel/`
- [ ] Build limpo sem erros: `npm run build`
- [ ] Bumped versão em todos os `package.json` afetados
- [ ] Sem quebra de API pública (se quebrar → major bump)
- [ ] `npm whoami` retorna `japostulo`
- [ ] Está na branch `main`/`master` atualizada

---

## 7. Configuração de Segredos (CI/CD — uma vez só)

Para o fluxo automático via GitHub Actions funcionar, os seguintes segredos precisam estar configurados no repositório `japostulo/opentelemetry` (Settings → Secrets and variables → Actions):

| Segredo | Como obter |
|---|---|
| `NPM_TOKEN` | npmjs.com → Account → Access Tokens → **Automation** token |
| `MONOREPO_SPLIT_TOKEN` | github.com → Settings → Developer settings → **Fine-grained tokens** → repo `opentelemetry-laravel` com write access |

E o webhook do Packagist no repo espelho `japostulo/opentelemetry-laravel`:
- Settings → Webhooks → Add webhook
- URL: `https://packagist.org/api/github?username=japostulo`
- Content-Type: `application/json`
- Secret: API Token do seu perfil em packagist.org

---

## 8. Histórico de Versões

| Data | node | web | laravel |
|---|---|---|---|
| 2025-XX | 1.0.0 | — | 1.0.0 |
| 2025-XX | 1.1.0 | 1.0.0 | — |
| 2025-XX | 1.2.0 | 1.1.0 | 1.1.0 |
| 2026-05-15 | **1.3.0** | **1.2.0** | **1.2.0** |
