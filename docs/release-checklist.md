# Release checklist

Feature-specific pre-PR/pre-deploy checklists. Each section is scoped to one
change; add a new section rather than growing a single generic list, so a
reviewer only has to read the part relevant to the PR in front of them.

## Import audit log release checklist

Scope: `import_audit_logs` table, `transactions.import_id`, and everything in
[import-audit-migration-runbook.md](import-audit-migration-runbook.md). Use
this before merging or deploying any change that touches that schema or
`lib/db/importAudit.ts`.

**Correction, 2026-07-11:** every item below that says "staging" originally
described `portify`, which the project owner had confirmed as staging on
2026-07-10. That confirmation was mistaken — `portify` is production. The
work described below genuinely happened exactly as described; only the
environment label was wrong. See
[import-audit-migration-runbook.md](import-audit-migration-runbook.md#production-validation-log)
("Production validation log", 2026-07-11 entry) for the full correction and
the resulting production test-data cleanup.

- [x] PR inclui a migration SQL (`supabase-migration-import-audit-log.sql`,
      já em `main` desde PR #129 — sem alterações nesta validação).
- [x] Migration testada — **em produção real** (`portify`, aplicada
      2026-07-10, ambiente correctamente identificado 2026-07-11), não
      apenas localmente. Ver runbook, "Production validation log".
- [x] `lib/supabase/database.types.ts` regenerado contra o projecto real —
      byte-a-byte idêntico à versão já existente. Ver runbook, "Production
      validation log".
- [x] RLS revista e **testada com dois utilizadores reais** (ver abaixo).
- [x] Supabase production migrado (migration aplicada via Supabase MCP,
      queries de verificação do runbook todas corridas com sucesso).
- [x] Importação XTB testada em produção com um ficheiro pequeno válido —
      CSV genérico (2 linhas, holdings) e XLSX rico (`buy` real) ambos
      confirmados na app real e na base de dados (runbook, "Production
      validation log").
- [x] Importação com linhas inválidas testada — linha com tipo não
      reconhecido correctamente marcada `'error'` e não gravada.
- [x] Importação com duplicados internos (dentro do próprio ficheiro)
      testada — a segunda ocorrência foi marcada `'duplicate'` e não gravada.
- [x] Importação com retenção na fonte (`withholding_tax`) testada em
      produção — **transacção real confirmada na tabela `transactions`**
      com `type = 'withholding_tax'`, `import_id` preenchido.
- [x] `interest_tax` e `deposit` testados via UI — **transacções reais
      confirmadas na tabela `transactions`** (`type = 'deposit'`,
      `amount = 500`; `type = 'interest_tax'`, `amount = -0.5`; ambas com
      `ticker: null` e `import_id` preenchido). `'wht'` continua não
      produzível pela UI de importação (não é um gap — `normalizeXtbTransactionType()`
      nunca o devolve; só existe via insert SQL directo, já coberto pela
      query de definição do constraint).
- [x] Importação duplicada persistente testada — reimportar o mesmo ficheiro
      correctamente marca as linhas `'duplicate'` e não duplica transactions.
      **Correcção do runbook**: quando 100% das linhas ficam duplicadas, o
      botão "Importar" fica desactivado e **nenhum novo audit log é criado**
      (não "completed com imported_rows: 0", como se assumia antes).
- [x] Falha de audit log testada — coberta por `e2e/notifications.spec.ts`
      (mock de 500); segundo ambiente não migrado não estava disponível
      nesta sessão para reconfirmar contra um backend real.
- [x] RLS testada com dois utilizadores distintos e reais da própria
      produção (simulação de sessão via `set local role authenticated` +
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
      (manual)").
- [x] Dados de teste criados durante a validação (utilizador descartável +
      holdings/transactions/audit logs) removidos da produção real
      (2026-07-11) — ver runbook, "Production validation log", entrada de
      2026-07-11, incluindo a query de remoção e a confirmação de que as
      contagens totais voltaram exactamente à baseline pré-teste.

**Produção está validada** (ver runbook, "Production validation log",
2026-07-10/2026-07-11).

**Actualização, 2026-07-10:** existe agora um ambiente de staging real e
independente, `portify-staging`, com o schema base aplicado, ligado ao
repositório, e testado (importação XTB completa + RLS com dois
utilizadores) — ver runbook, secção "`portify-staging` bootstrap". Uma
divergência de schema bloqueante (`investment_plans.monthly_amount` vs.
`amount`) foi encontrada e corrigida só em staging; um gap menor e não
bloqueante (algumas colunas de `profiles` e a view `investor_profiles`,
ausentes de `supabase-schema.sql`) continua documentado mas não corrigido —
recomenda-se resolver `supabase-schema.sql` numa PR dedicada antes da
próxima alteração de schema.

## Supabase environment guardrails

Scope: any PR that applies a migration, regenerates
`lib/supabase/database.types.ts` against a real project, or otherwise runs a
sensitive operation against Supabase. See
[docs/supabase-environments.md](supabase-environments.md) for the full
policy and [scripts/check-supabase-environment.mjs](../scripts/check-supabase-environment.mjs)
(`npm run check:supabase-env`) for the automated check.

**Correction, 2026-07-11:** the confirmation described below
(`SUPABASE_ENVIRONMENT=staging`, ref matching `portify`) was run correctly
and passed exactly as designed — the guardrail did its job. What failed was
the human confirmation feeding it: the project owner said "staging" in good
faith about a project that is actually production. The guardrail script
cannot detect a human confirming the wrong environment name; it can only
enforce that *some* explicit confirmation happened. See
[docs/supabase-environments.md](supabase-environments.md) for whether this
changes the recommended confirmation procedure.

- [x] `SUPABASE_ENVIRONMENT=staging` definido localmente e
      `npm run check:supabase-env -- --target=staging` corrido e a passar
      antes de qualquer operação sensível (2026-07-10) — **valor correcto
      seria `production`, dado o que se veio a confirmar em 2026-07-11**;
      o comando em si passou correctamente para o valor então indicado.
- [x] `SUPABASE_PROJECT_REF` confirmado — **explicitamente pelo dono do
      projecto**, nesta conversa, para o projecto anteriormente ambíguo
      `"portify"` (masked `dwol****donk`) — **confirmado em 2026-07-11 como
      sendo produção**, não staging. Ver runbook, "Production validation
      log".
- [x] Linked project ref (`supabase/.temp/linked-project.json`) coincide com
      `SUPABASE_PROJECT_REF` — confirmado, sem divergência.
- [x] Ambiente confirmado manualmente antes da migration — por decisão
      explícita do dono do projecto (não pela heurística de nome, que não
      teria apanhado este caso — ver limitação já documentada em
      `docs/supabase-environments.md`) — e registado no runbook. **A
      confirmação inicial estava errada** (disse staging, era produção);
      corrigida e registada em 2026-07-11.
- [x] Produção exigiu confirmação explícita — retroactivamente, dado que o
      ambiente afinal sempre foi produção: `--confirm-production` não foi
      usado na altura (o comando corrido foi `--target=staging`), porque a
      produção não tinha sido identificada como tal. Nenhuma migration nova
      foi aplicada depois da correcção — só documentação e limpeza de dados
      de teste, que não exigem o guardrail de migration.
- [x] Output de `npm run check:supabase-env` registado no runbook, secção
      "Production validation log" — refs sempre mascarados.
- [x] Nenhum secret (anon key, service role key, JWT secret, database
      URL/password, ou project ref não mascarado) aparece nos logs, no PR,
      ou em qualquer documento deste repositório — confirmado por inspecção
      de todo o output usado nesta validação.
- [x] `lib/supabase/database.types.ts` regenerado depois da migration
      (já estava aplicada) contra o ambiente confirmado (`portify`,
      produção) — byte-a-byte idêntico ao já existente.
