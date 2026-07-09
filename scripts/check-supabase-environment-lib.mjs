// Pure logic for scripts/check-supabase-environment.mjs, split out so it's
// testable with Vitest without touching real env vars, argv, or the
// filesystem. No I/O here — the CLI wrapper does all reading/printing/exit.

export const VALID_ENVIRONMENTS = ['local', 'staging', 'production'];

/**
 * Masks a project ref (or any short identifier) for safe printing: keeps the
 * first and last 4 characters, replaces the middle with '****'. Refs of 8
 * characters or fewer are fully masked — not enough length left to reveal
 * only-the-middle without effectively showing the whole thing.
 */
export function maskRef(ref) {
  if (!ref) return undefined;
  if (ref.length <= 8) return '****';
  return `${ref.slice(0, 4)}****${ref.slice(-4)}`;
}

/**
 * Parses the two flags this script accepts. Unknown flags are ignored (not
 * an error) — this script is a guardrail check, not a general-purpose CLI.
 */
export function parseArgs(argv) {
  let target;
  let confirmProduction = false;
  for (const arg of argv) {
    if (arg.startsWith('--target=')) target = arg.slice('--target='.length);
    if (arg === '--confirm-production') confirmProduction = true;
  }
  return { target, confirmProduction };
}

/**
 * Core guardrail logic. Takes a plain-object snapshot of everything relevant
 * (env vars, parsed args, and the linked-project.json contents, if any) and
 * returns { ok, errors, warnings } plus masked values safe to print.
 *
 * `linkedProject` is:
 *   - `{ ref, name }` if supabase/.temp/linked-project.json exists and parsed
 *   - `null` if the file doesn't exist (or isn't readable) — a warning, not
 *     an error, since not every environment has run `supabase link`.
 */
export function evaluateEnvironment({
  supabaseEnvironment,
  projectRefEnv,
  supabaseUrl,
  target,
  confirmProduction,
  linkedProject,
}) {
  const errors = [];
  const warnings = [];

  if (!supabaseEnvironment) {
    errors.push(
      'SUPABASE_ENVIRONMENT is not set. Refusing to treat this as any environment by default — ' +
      'see docs/supabase-environments.md. Set it to one of: ' + VALID_ENVIRONMENTS.join(', ') + '.'
    );
  } else if (!VALID_ENVIRONMENTS.includes(supabaseEnvironment)) {
    errors.push(
      `SUPABASE_ENVIRONMENT has an invalid value ("${supabaseEnvironment}"). ` +
      'Must be exactly one of: ' + VALID_ENVIRONMENTS.join(', ') + '.'
    );
  } else {
    // Only meaningful once supabaseEnvironment is itself valid.
    if (target !== undefined) {
      if (!VALID_ENVIRONMENTS.includes(target)) {
        errors.push(`--target has an invalid value ("${target}"). Must be one of: ${VALID_ENVIRONMENTS.join(', ')}.`);
      } else if (target !== supabaseEnvironment) {
        errors.push(
          `--target=${target} does not match SUPABASE_ENVIRONMENT=${supabaseEnvironment}. ` +
          'This mismatch is exactly the kind of ambiguity this check exists to catch — stop and reconcile before proceeding.'
        );
      }
    }

    if (supabaseEnvironment === 'production' && !confirmProduction) {
      errors.push(
        'SUPABASE_ENVIRONMENT=production requires the explicit --confirm-production flag on top of ' +
        '--target=production. This is deliberate — a command copy-pasted from a staging run must not silently also apply to production.'
      );
    }

    if (linkedProject?.name) {
      if (supabaseEnvironment === 'staging' && /prod/i.test(linkedProject.name)) {
        errors.push(
          `SUPABASE_ENVIRONMENT=staging, but the linked project's name ("${linkedProject.name}") looks like production. Refusing to proceed.`
        );
      }
      if (supabaseEnvironment === 'production' && /staging/i.test(linkedProject.name)) {
        errors.push(
          `SUPABASE_ENVIRONMENT=production, but the linked project's name ("${linkedProject.name}") looks like staging. Refusing to proceed.`
        );
      }
    }
  }

  if (projectRefEnv && linkedProject?.ref && projectRefEnv !== linkedProject.ref) {
    errors.push(
      'SUPABASE_PROJECT_REF does not match the project ref recorded in supabase/.temp/linked-project.json. ' +
      'These must point at the same project — re-run `supabase link` or fix SUPABASE_PROJECT_REF.'
    );
  }

  if (linkedProject === null) {
    warnings.push('No linked project found (supabase/.temp/linked-project.json is missing or unreadable) — cannot cross-check SUPABASE_PROJECT_REF against it.');
  }

  if (!projectRefEnv && supabaseUrl) {
    warnings.push('SUPABASE_PROJECT_REF is not set; only NEXT_PUBLIC_SUPABASE_URL is available. Consider setting SUPABASE_PROJECT_REF explicitly for a more reliable cross-check.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    maskedProjectRefEnv: maskRef(projectRefEnv),
    maskedLinkedRef: maskRef(linkedProject?.ref),
    linkedProjectName: linkedProject?.name,
  };
}
