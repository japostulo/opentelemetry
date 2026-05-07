#!/bin/bash
# Script de teste de validação completa do profile switching
# Uso: ./test-profile-switching.sh [minimal|standard|verbose]

set -e

PROFILE=${1:-standard}
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_NC='\033[0m' # No Color

echo -e "${COLOR_BLUE}═══════════════════════════════════════════════════════${COLOR_NC}"
echo -e "${COLOR_BLUE}  Teste de Validação - Profile: ${PROFILE}${COLOR_NC}"
echo -e "${COLOR_BLUE}═══════════════════════════════════════════════════════${COLOR_NC}"

# 1. Aplicar profile em todos os serviços
echo -e "\n${COLOR_YELLOW}[1/6] Aplicando profile ${PROFILE} em todos os serviços...${COLOR_NC}"

if [ "$PROFILE" = "standard" ] || [ "$PROFILE" = "verbose" ]; then
  BODY_DATA='{"profile":"'$PROFILE'","captureBody":true,"captureResponse":true,"logDestination":"both"}'
else
  BODY_DATA='{"profile":"'$PROFILE'","captureBody":null,"captureResponse":null,"logDestination":"both"}'
fi

curl -s -X PUT http://localhost:3010/admin/config -H "Content-Type: application/json" -d "$BODY_DATA" > /dev/null
curl -s -X PUT http://localhost:3020/admin/config -H "Content-Type: application/json" -d "$BODY_DATA" > /dev/null
curl -s -X PUT http://localhost:8085/api/admin/config -H "Content-Type: application/json" -d "$BODY_DATA" > /dev/null

echo -e "${COLOR_GREEN}✓ Profile aplicado${COLOR_NC}"

# 2. Verificar configuração
echo -e "\n${COLOR_YELLOW}[2/6] Verificando configuração...${COLOR_NC}"
NESTJS_CONFIG=$(curl -s http://localhost:3010/admin/config)
echo "NestJS: $NESTJS_CONFIG"

# 3. Fazer POST /echo para gerar span
echo -e "\n${COLOR_YELLOW}[3/6] Fazendo POST /echo para gerar span...${COLOR_NC}"
RESPONSE=$(curl -s -X POST http://localhost:3010/echo -H "Content-Type: application/json" \
  -d '{
    "name": "Teste'$PROFILE'",
    "password": "senha123",
    "cpf": "12345678900",
    "email": "teste@example.com",
    "normalField": "visivel"
  }')

TRACE_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['traceId'])" 2>/dev/null || echo "ERROR")

if [ "$TRACE_ID" = "ERROR" ]; then
  echo -e "${COLOR_RED}✗ Erro ao capturar traceId${COLOR_NC}"
  exit 1
fi

echo -e "${COLOR_GREEN}✓ Span gerado${COLOR_NC}"
echo -e "  TraceId: ${COLOR_GREEN}$TRACE_ID${COLOR_NC}"

# 4. Aguardar processamento
echo -e "\n${COLOR_YELLOW}[4/6] Aguardando 3s para processamento no SigNoz...${COLOR_NC}"
sleep 3
echo -e "${COLOR_GREEN}✓ Pronto${COLOR_NC}"

# 5. Verificar logs
echo -e "\n${COLOR_YELLOW}[5/6] Verificando logs do NestJS...${COLOR_NC}"
LOGS=$(docker compose -f playground/docker-compose.yml logs nestjs-app --tail=10 2>&1 | grep "Teste$PROFILE" || echo "")

if [ -z "$LOGS" ]; then
  echo -e "${COLOR_RED}✗ Logs não encontrados${COLOR_NC}"
else
  echo -e "${COLOR_GREEN}✓ Logs capturados:${COLOR_NC}"
  echo "$LOGS" | grep -E "body\.|response\." | head -3
fi

# 6. Instruções para validação no SigNoz
echo -e "\n${COLOR_YELLOW}[6/6] Validação no SigNoz:${COLOR_NC}"
echo -e "${COLOR_BLUE}──────────────────────────────────────────────────────${COLOR_NC}"
echo -e "1. Abra: ${COLOR_GREEN}http://localhost:3301${COLOR_NC}"
echo -e "2. Vá em: ${COLOR_GREEN}Traces${COLOR_NC} no menu lateral"
echo -e "3. Adicione filtro: ${COLOR_GREEN}trace_id = \"$TRACE_ID\"${COLOR_NC}"
echo -e "4. Clique no trace encontrado"
echo -e "5. Vá na aba ${COLOR_GREEN}Tags${COLOR_NC} ou ${COLOR_GREEN}Attributes${COLOR_NC}"
echo -e "${COLOR_BLUE}──────────────────────────────────────────────────────${COLOR_NC}"

# Expectativas por profile
echo -e "\n${COLOR_BLUE}Atributos esperados no span (profile: $PROFILE):${COLOR_NC}"

if [ "$PROFILE" = "minimal" ]; then
  echo -e "${COLOR_RED}❌ body.* - NÃO DEVE ESTAR PRESENTE${COLOR_NC}"
  echo -e "${COLOR_RED}❌ response.* - NÃO DEVE ESTAR PRESENTE${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ http.method, http.route, http.status_code${COLOR_NC}"
elif [ "$PROFILE" = "standard" ] || [ "$PROFILE" = "verbose" ]; then
  echo -e "${COLOR_GREEN}✓ body.name = \"Teste$PROFILE\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ body.password = \"[REDACTED]\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ body.cpf = \"[REDACTED]\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ body.email = \"teste@example.com\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ body.normalField = \"visivel\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ response.service = \"nestjs\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ response.traceId = \"$TRACE_ID\"${COLOR_NC}"
  echo -e "${COLOR_GREEN}✓ response.received.password = \"[REDACTED]\"${COLOR_NC}"
fi

echo -e "\n${COLOR_BLUE}═══════════════════════════════════════════════════════${COLOR_NC}"
echo -e "${COLOR_GREEN}✓ Teste concluído!${COLOR_NC}"
echo -e "${COLOR_BLUE}═══════════════════════════════════════════════════════${COLOR_NC}"
echo -e "\nPara mais detalhes, consulte: ${COLOR_GREEN}playground/VALIDATION_GUIDE.md${COLOR_NC}\n"
