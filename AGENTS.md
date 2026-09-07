# Working on Villa Treny

This repository contains the dedicated Night Shift habitat simulation extracted from Portfolio. The original Portfolio night mode is a different feature and remains in that project's main branch.

- Keep product text in English and the existing pixel-art identity.
- Reuse licensed source pixels and exact crop coordinates for room art. Do not invent furniture or replace artwork with shapes, gradients or generated imagery.
- Use integer magnification and nearest-neighbour rendering. Verify collisions against actual artwork as well as connectivity and population reservations.
- Economic decisions are independent of exact visual co-location. Do not make the observer advance the world or purchase cognition.
- Preserve the existing Worker name, class, binding, habitat ID, migrations, world and quotas when changing deployment. A public snapshot is not a complete recovery backup.
- Do not copy secrets into Git or expose administrative operations in the observer. Tests use isolated fixtures/local Workers and do not call real inference.
- Run `pnpm check`, `pnpm build`, and relevant browser/export checks after material changes. Record limitations accurately.
- Do not merge the dedicated simulation into Portfolio. The archived source and extraction manifest document its origin.
- For authorized commits, the sole author and committer are Alejandro Treny Ortega `<alejandrotreny100@gmail.com>`. Set command-local identity variables; do not change global Git configuration or add generated co-author trailers.
