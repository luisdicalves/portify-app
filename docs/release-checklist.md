# Release checklist

Feature-specific pre-PR/pre-deploy checklists. Each section is scoped to one
change; add a new section rather than growing a single generic list, so a
reviewer only has to read the part relevant to the PR in front of them.

## Import audit log release checklist

Scope: `import_audit_logs` table, `transactions.import_id`, and everything in
[import-audit-migration-runbook.md](import-audit-migration-runbook.md). Use
this before merging or deploying any change that touches that schema or
`lib/db/importAudit.ts`.

- [x] PR inclui a migration SQL (`supabase-migration-import-audit-log.sql`,
      já em `main` desde PR #129 — sem alterações nesta validação).
- [x] Migration testada — **em staging real** (`portify`, 2026-07-10), não
      apenas localmente. Ver runbook, "Staging validation log".
- [x] `lib/supabase/database.types.ts` regenerado contra o projecto real —
      byte-a-byte idêntico à versão já existente. Ver runbook, "Staging
      validation log".
- [x] RLS revista e **testada com dois utilizadores reais** (ver abaixo).
- [x] Supabase staging migrado (migration aplicada via Supabase MCP,
      queries de verificação do runbook todas corridas com sucesso).
- [x] Importação XTB testada em staging com um ficheiro pequeno válido —
      CSV genérico (2 linhas, holdings) e XLSX rico (`buy` real) ambos
      confirmados na app real e na base de dados (runbook, "Staging
      validation log").
- [x] Importação com linhas inválidas testada — linha com tipo não
      reconhecido correctamente marcada `'error'` e não gravada.
- [x] Importação com duplicados internos (dentro do próprio ficheiro)
      testada — a segunda ocorrência foi marcada `'duplicate'` e não gravada.
- [x] Importação com retenção na fonte (`withholding_tax`) testada em
      staging — **transacção real confirmada na tabela `transactions`**
      com `type = 'withholding_tax'`, `import_id` preenchido.
- [ ] `interest_tax` e `deposit` — **não testados via UI nesta sessão**
      (mesma função/mesmo constraint que `withholding_tax`, considerado
      coberto por inferência + testes unitários existentes, mas não
      empiricamente confirmado end-to-end). `'wht'` continua não produzível
      pela UI de importação.
- [x] Importação duplicada persistente testada — reimportar o mesmo ficheiro
      correctamente marca as linhas `'duplicate'` e não duplica transactions.
      **Correcção do runbook**: quando 100% das linhas ficam duplicadas, o
      botão "Importar" fica desactivado e **nenhum novo audit log é criado**
      (não "completed com imported_rows: 0", como se assumia antes).
- [x] Falha de audit log testada — coberta por `e2e/notifications.spec.ts`
      (mock de 500); segundo ambiente não migrado não estava disponível
      nesta sessão para reconfirmar contra um backend real.
- [x] RLS testada com dois utilizadores distintos e reais do próprio
      staging (simulação de sessão via `set local role authenticated` +
      `request.jwt.claims`): utilizador A não vê nem actualiza imports de B,
      `delete` bloqueado mesmo para o dono, `transactions.import_id`
      correctamente associado por utilizador.
- [x] Confirmado, com a query do runbook, o número de transacções sem
      audit log — **130, correspondendo exactamente aos dados pré-existentes
      anteriores a esta migration** (baseline esperado, não uma violação;
      ver correcção na secção "Troubleshooting / mitigation" do runbook).
      Nenhum `import_audit_logs` preso em `'pending'`.
- [x] Confirmado que nenhum conteúdo bruto do ficheiro é guardado —
      `import_audit_logs` só guarda metadados/sumários (`filename`,
      `file_hash`, contagens, `summary`/`warnings`/`errors` agregados),
      nunca o ficheiro em si nem uma cópia linha-a-linha do seu conteúdo.
- [x] Rollback documentado e revisto (ver runbook — secção "Rollback
      (manual)") — **ainda não exercido em produção**, nem precisa de o ser
      para este PR (só staging foi tocado).

Staging está agora validado (ver runbook, "Staging validation log",
2026-07-10). **Produção continua por fazer** — repetir a mesma sequência lá,
com backup/PITR confirmado e `--confirm-production` no guardrail, só depois
de reviste a lista acima novamente para esse ambiente especificamente.

## Supabase environment guardrails

Scope: any PR that applies a migration, regenerates
`lib/supabase/database.types.ts` against a real project, or otherwise runs a
sensitive operation against Supabase. See
[docs/supabase-environments.md](supabase-environments.md) for the full
policy and [scripts/check-supabase-environment.mjs](../scripts/check-supabase-environment.mjs)
(`npm run check:supabase-env`) for the automated check.

- [x] `SUPABASE_ENVIRONMENT=staging` definido localmente e
      `npm run check:supabase-env -- --target=staging` corrido e a passar
      antes de qualquer operação sensível (2026-07-10).
- [x] `SUPABASE_PROJECT_REF` confirmado — **explicitamente pelo dono do
      projecto**, nesta conversa, para o projecto anteriormente ambíguo
      `"portify"` (masked `dwol****donk`). Ver runbook, "Staging validation
      log".
- [x] Linked project ref (`supabase/.temp/linked-project.json`) coincide com
      `SUPABASE_PROJECT_REF` — confirmado, sem divergência.
- [x] Staging confirmado manualmente antes da migration — por decisão
      explícita do dono do projecto (não pela heurística de nome, que não
      teria apanhado este caso — ver limitação já documentada em
      `docs/supabase-environments.md`) — e registado no runbook.
- [ ] Produção exige confirmação explícita — **não aplicável a este PR**,
      produção não foi tocada.
- [x] Output de `npm run check:supabase-env` registado no runbook, secção
      "Staging validation log" — refs sempre mascarados.
- [x] Nenhum secret (anon key, service role key, JWT secret, database
      URL/password, ou project ref não mascarado) aparece nos logs, no PR,
      ou em qualquer documento deste repositório — confirmado por inspecção
      de todo o output usado nesta validação.
- [x] `lib/supabase/database.types.ts` regenerado depois da migration
      (já estava aplicada) contra o ambiente confirmado (`portify` staging)
      — byte-a-byte idêntico ao já existente.
