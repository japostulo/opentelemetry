<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { identityBaggageScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Identity & Baggage</h1>
    <p class="text-body-1 mb-6">
      Testes de identidade de usuário e propagação de baggage W3C entre frontend e backend.
    </p>

    <v-divider class="mb-6" />

    <!-- ── Span Attributes ─────────────────────────────────────────── -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-account-outline</v-icon> Span Attributes de User Identity
    </h2>
    <p class="text-body-2 mb-3">
      O Node SDK registra a identidade do usuário diretamente como <strong>span attributes</strong>
      via <code>identifyUser()</code> — chamado dentro de guards (NestJS) ou middlewares (Express).
      O Web SDK usa <code>setUser()</code> que também adiciona os mesmos atributos aos spans do browser.
    </p>
    <v-table density="compact" class="mb-4">
      <thead>
        <tr>
          <th>Attribute</th>
          <th>Descrição</th>
          <th>Fonte</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>user.id</code></td>
          <td>ID do usuário</td>
          <td>
            Node: <code>identifyUser()</code> em guard/middleware<br />
            Web: <code>setUser()</code> no browser
          </td>
        </tr>
        <tr>
          <td><code>user.role</code></td>
          <td>Role do usuário (ex: admin, operator)</td>
          <td>Mesmo que acima</td>
        </tr>
        <tr>
          <td><code>user.type</code></td>
          <td><code>authenticated</code> | <code>anonymous</code> | <code>service</code></td>
          <td>Inferido automaticamente quando não informado</td>
        </tr>
      </tbody>
    </v-table>

    <v-alert type="warning" variant="tonal" density="compact" class="mb-6">
      <strong>Sem prefixo <code>haoc.</code></strong> — Os atributos são <code>user.id</code>, <code>user.role</code> e
      <code>user.type</code> (não <code>haoc.user.*</code>). Ambos os SDKs (Node e Web) usam os mesmos nomes.
    </v-alert>

    <!-- ── Fluxo ───────────────────────────────────────────────────── -->
    <h2 class="text-h5 font-weight-bold mb-3 mt-2">
      <v-icon class="mr-1">mdi-transit-connection-variant</v-icon> Duas formas de usar identifyUser()
    </h2>

    <v-row class="mb-2">
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4 h-100">
          <div class="d-flex align-center mb-3">
            <v-chip color="blue" variant="flat" size="small" class="mr-2">Forma 1</v-chip>
            <span class="text-subtitle-2 font-weight-bold">Via header — guard/middleware extrai</span>
          </div>
          <p class="text-body-2 mb-3">
            Simulação de JWT/API-key: o backend recebe um token ou header, valida, e chama
            <code>identifyUser()</code> no guard/middleware. A identidade fica disponível em toda a request.
          </p>
          <pre class="text-caption" style="font-family: monospace; line-height: 1.7; font-size: 11px;">
// NestJS Guard (ou Express middleware)
const userId = req.headers['x-user-id'];
// (na prática: verificar JWT e extrair o user)
if (!userId) throw new UnauthorizedException();

identifyUser({ id: userId, role, type: 'authenticated' });
// → user.id, user.role, user.type no span + logs</pre>
          <v-divider class="my-2" />
          <div class="text-caption text-grey">
            Rotas de teste: <code>GET /secured/profile</code><br />
            Header necessário: <code>x-user-id: usr_42</code>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4 h-100">
          <div class="d-flex align-center mb-3">
            <v-chip color="green" variant="flat" size="small" class="mr-2">Forma 2</v-chip>
            <span class="text-subtitle-2 font-weight-bold">Auth interna — backend chama diretamente</span>
          </div>
          <p class="text-body-2 mb-3">
            O backend obtém o usuário de sessão, banco de dados ou contexto interno e chama
            <code>identifyUser()</code> diretamente no handler ou serviço.
          </p>
          <pre class="text-caption" style="font-family: monospace; line-height: 1.7; font-size: 11px;">
// Handler NestJS (ou Express route)
@Get('identity')
identity() {
  // user vem de sessão, DB, cache, etc.
  const user = this.authService.getCurrentUser();
  identifyUser({ id: user.id, role: user.role });
  // → user.id, user.role no span
}</pre>
          <v-divider class="my-2" />
          <div class="text-caption text-grey">
            Rota de teste: <code>GET /identity</code><br />
            Sem header necessário — auth interna hardcoded no playground
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Qual usar?</strong> Ambas chamam <code>identifyUser()</code> e produzem os mesmos atributos no span.
      A diferença é <em>de onde vem</em> o usuário: Forma 1 = token/header da request; Forma 2 = auth interna (sessão, DB, contexto).
    </v-alert>

    <!-- ── Como testar ─────────────────────────────────────────────── -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-console</v-icon> Como testar via curl
    </h2>
    <v-card variant="outlined" class="pa-3 mb-4" style="background: #1e1e2e;">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.8; color: #cdd6f4;">
<span style="color:#a6e3a1"># ── Forma 1: via header (guard extrai e chama identifyUser) ──────────</span>
<span style="color:#89b4fa"># NestJS — autenticado (admin)</span>
curl -s -H "x-user-id: usr_42" -H "x-user-role: admin" \
  http://localhost:3010/secured/profile | jq .

<span style="color:#89b4fa"># NestJS — sem header → 401</span>
curl -s http://localhost:3010/secured/profile | jq .

<span style="color:#89b4fa"># Express — autenticado (operator)</span>
curl -s -H "x-user-id: usr_99" -H "x-user-role: operator" \
  http://localhost:3020/secured/profile | jq .

<span style="color:#a6e3a1"># ── Forma 2: auth interna (backend chama identifyUser diretamente) ───</span>
<span style="color:#89b4fa"># NestJS — identifyUser() hardcoded (simula sessão/DB lookup)</span>
curl -s http://localhost:3010/identity | jq .

<span style="color:#89b4fa"># Express — mesmo padrão</span>
curl -s http://localhost:3020/identity | jq .</pre>
    </v-card>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Para validar no SigNoz:</strong>
      <ul class="mt-1 ml-3" style="list-style: disc;">
        <li><strong>Forma 1</strong> (header): Traces → <code>serviceName=playground-nestjs</code> → span <code>GET /secured/profile</code> → Tags: <code>user.id</code>, <code>user.role</code>, <code>user.type</code></li>
        <li><strong>Forma 2</strong> (interna): Traces → <code>serviceName=playground-nestjs</code> → span <code>GET /identity</code> → mesmos atributos</li>
        <li><strong>401</strong> (sem header): span deve ter <code>http.status_code=401</code> e <strong>não</strong> ter <code>user.*</code></li>
      </ul>
    </v-alert>

    <!-- ── W3C Baggage ─────────────────────────────────────────────── -->
    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-bag-suitcase-outline</v-icon> W3C Baggage — contexto do browser
    </h2>
    <p class="text-body-2 mb-3">
      O Web SDK propaga automaticamente informações do navegador via W3C Baggage em todos os requests.
      Esses dados aparecem como span attributes no backend:
    </p>
    <v-table density="compact" class="mb-6">
      <thead>
        <tr>
          <th>Baggage Item</th>
          <th>Exemplo</th>
          <th>Onde aparece no SigNoz</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><code>user.id</code></td><td>usr_42</td><td>Span tags do backend (se setUser() foi chamado)</td></tr>
        <tr><td><code>user.role</code></td><td>admin</td><td>Span tags do backend</td></tr>
        <tr><td><code>page.url</code></td><td>/dashboard</td><td>Span tags do backend</td></tr>
        <tr><td><code>page.route</code></td><td>dashboard</td><td>Span tags do backend</td></tr>
        <tr><td><code>browser.name</code></td><td>Chrome</td><td>Span tags do backend</td></tr>
        <tr><td><code>device.type</code></td><td>desktop</td><td>Span tags do backend</td></tr>
        <tr><td><code>app.platform</code></td><td>web</td><td>Span tags do backend</td></tr>
      </tbody>
    </v-table>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Para validar baggage do frontend:</strong> Navegue pelo web-app playground e faça um request
      a uma API. No SigNoz, abra o span do backend e verifique as tags <code>page.*</code>,
      <code>browser.*</code> e <code>device.*</code>. Estes dados vêm do header <code>baggage</code>
      propagado automaticamente pelo Web SDK.
    </v-alert>

    <!-- ── Cenários de Teste ───────────────────────────────────────── -->
    <TestScenarioTable :scenarios="identityBaggageScenarios" title="Identity Scenarios (G1–G5, H1–H2)" />
  </div>
</template>
