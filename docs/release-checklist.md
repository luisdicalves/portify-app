# Release checklist

Feature-specific pre-PR/pre-deploy checklists. Each section is scoped to one
change; add a new section rather than growing a single generic list, so a
reviewer only has to read the part relevant to the PR in front of them.

## Import audit log release checklist

Scope: `import_audit_logs` table, `transactions.import_id`, and everything in
[import-audit-migration-runbook.md](import-audit-migration-runbook.md). Use
this before merging or deploying any change that touches that schema or
`lib/db/importAudit.ts`.

- [ ] PR inclui a migration SQL (`supabase-migration-import-audit-log.sql`
      atualizado, ou uma nova migration incremental se for uma alteração
      subsequente).
- [ ] Migration testada localmente (Postgres/Supabase local) **ou**, se isso
      não estiver disponível, revista manualmente campo a campo contra
      `supabase-schema.sql` e `lib/supabase/database.types.ts`
      (`npm run check:schema` corrido e a passar).
- [ ] `lib/supabase/database.types.ts` regenerado contra o projecto real
      (`npx supabase gen types ...`) **ou**, se ainda não for possível,
      justificação documentada no runbook (ver secção "What was and wasn't
      validated" do runbook).
- [ ] RLS revista: `select`/`insert`/`update` policies scoped a
      `auth.uid() = user_id`, **sem** policy de `delete` (decisão
      deliberada — ver runbook).
- [ ] Supabase staging migrado (migration aplicada e queries de verificação
      do runbook corridas com sucesso).
- [ ] Importação XTB testada em staging com um ficheiro pequeno (poucas
      linhas) — audit log criado, transactions com `import_id` preenchido.
- [ ] Importação com retenção na fonte (`withholding_tax`) testada em
      staging — confirma que o `transactions_type_check` alargado aceita o
      tipo (bug pré-existente corrigido por esta migration).
- [ ] Importação duplicada testada — reimportar o mesmo ficheiro não
      duplica transactions, e continua a criar um audit log
      (`imported_rows: 0`, `status: 'completed'`).
- [ ] Falha de audit log testada — com `import_audit_logs` indisponível
      (ou RLS a bloquear), a importação aborta e nada é gravado
      (ver `e2e/notifications.spec.ts`).
- [ ] Confirmado que nenhum conteúdo bruto do ficheiro é guardado —
      `import_audit_logs` só guarda metadados/sumários (`filename`,
      `file_hash`, contagens, `summary`/`warnings`/`errors` agregados),
      nunca o ficheiro em si nem uma cópia linha-a-linha do seu conteúdo.
- [ ] Rollback documentado e revisto (ver runbook — secção "Rollback
      (manual)") antes de aplicar em produção.

Only after every box above is checked for **staging** should the same
sequence be repeated for **production**.
