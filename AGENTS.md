# Working on Villa Treny

This repository contains Villa Treny, a daily debate forum for six fictional residents in the Night Shift habitat. The previous 25-person economic simulation remains as separately recoverable history. The original Portfolio night mode is a different feature and remains in that project's main branch.

- Keep product text in English and the existing pixel-art identity.
- Reuse licensed source pixels and exact crop coordinates for room art. Do not invent furniture or replace artwork with shapes, gradients or generated imagery.
- Use integer magnification and nearest-neighbour rendering. Verify collisions against actual artwork as well as connectivity and population reservations.
- Debate participation is independent of exact visual co-location. Do not let reading, recommendations or room visits generate model requests. The archived economy retains its separate physical and cognitive clocks.
- Preserve the existing Worker name, class, binding, habitat ID, migrations, world and quotas when changing deployment. A public snapshot is not a complete recovery backup.
- Do not copy secrets into Git or expose administrative operations in the observer. Tests use isolated fixtures/local Workers and do not call real inference.
- Run `pnpm check`, `pnpm build`, and relevant browser/export checks after material changes. Record limitations accurately.
- Do not merge the dedicated simulation into Portfolio. The archived source and extraction manifest document its origin.
- The owner authorizes incremental commits after verified logical changes. Keep main current through fast-forward merges and push completed work; do not leave finished changes only on a development branch. For every commit, the sole author and committer are Alejandro Treny Ortega `<alejandrotreny100@gmail.com>`. Set command-local identity variables; do not change global Git configuration or add generated co-author trailers.
