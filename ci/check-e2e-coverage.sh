#!/usr/bin/env bash
# Verifica se alterações a páginas da app têm testes E2E correspondentes.
#
# Regras:
#   • Ficheiros alterados em app/**/page.tsx → obriga a alterações em e2e/
#   • Escape hatch: label "skip-e2e" no PR (verificado pelo workflow)
#
# Uso: bash ci/check-e2e-coverage.sh
set -euo pipefail

BASE="${GITHUB_BASE_REF:-main}"

# Ficheiros alterados neste PR face ao branch base
CHANGED=$(git diff --name-only "origin/${BASE}...HEAD" 2>/dev/null || git diff --name-only HEAD~1 HEAD)

# Páginas da app modificadas (exclui ficheiros de teste e config)
APP_PAGES=$(echo "$CHANGED" | grep -E '^app/.+/page\.tsx$' || true)

# Ficheiros E2E modificados
E2E_CHANGED=$(echo "$CHANGED" | grep -E '^e2e/.+\.spec\.ts$' || true)

if [ -z "$APP_PAGES" ]; then
  echo "✅  Nenhuma página da app alterada — verificação E2E ignorada."
  exit 0
fi

echo "📄  Páginas alteradas:"
echo "$APP_PAGES" | sed 's/^/    /'

if [ -n "$E2E_CHANGED" ]; then
  echo ""
  echo "✅  Testes E2E presentes:"
  echo "$E2E_CHANGED" | sed 's/^/    /'
  exit 0
fi

echo ""
echo "❌  Páginas da app foram modificadas mas não há testes E2E adicionados ou atualizados."
echo ""
echo "    Adiciona ou atualiza testes em e2e/ que cubram as páginas alteradas."
echo "    Se E2E genuinamente não se aplica, adiciona o label 'skip-e2e' ao PR."
exit 1
