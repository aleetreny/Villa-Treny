# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Scope

Villa Treny is a daily forum for six fictional residents. It lives in its own repository and Cloudflare application. Portfolio and its original Night Shift mode are separate projects.

## Users

A visitor reads an unusual, understandable hypothetical situation, follows the residents' responses, revisits previous discussions and recommends debates worth reading. The visitor may also explore the pixel-art habitat and meet its residents.

## Product Purpose

Publish one thoughtful discussion per day. Stable, broad values should lead to distinctive reasoning across many domains without assigning conclusions, inventing a winner or pretending that six generated perspectives represent a real population.

## Operating Context

Daily generation runs in the cloud independently of visitors. Nine short contributions form a continuous conversation: each is generated separately after reading all earlier turns. All six residents take part, some return to a point, and their order rotates by date. Two highlights quote the original contributions and link back to their context; the system does not rewrite them into a verdict. Question selection rotates through twelve subject areas and a mix of playful, awkward and ambitious situations, with three candidates, recent-case avoidance and a separate editorial selection. Starting points are inspiration; at least one draft should explore a different decision within the subject. Recent context helps the editor spot repeated underlying stories, not merely repeated titles.

## Capabilities and Constraints

The board is primary and can expand for reading. Archive search, subject filters, recommendation ordering and pagination cover permanent stored editions. A recommendation means "worth reading", is reversible, and uses one anonymous browser cookie. Six profiles preserve the residents' names, backgrounds and portraits, with versioned convictions. The habitat has its own page using the approved rooms, movement, collisions and integer pixel scaling. Ambient movement does not determine what residents say.

One daily edition normally needs twelve Gemini requests, with at most twenty attempts. Gemini 3.5 Flash Lite is the ongoing production choice, approved by the owner after repeated Gemini 3.8 Flash failures. The inactive 3.8 integration remains available without making an upgrade a product requirement. Attempts are durably reserved before dispatch. Accepted posts survive errors, incomplete editions remain explicit, and no observer action requests model inference. Earlier six-opening/six-reply editions remain as published. Free provider capacity is external and not guaranteed indefinitely.

## Brand Commitments

Preserve the user-approved Night Shift pixel-art world, its local typefaces and quiet, dark iron/paper/brass palette. Make it a place to read and spend time, not an AI dashboard or setup guide. Product copy is English.

## Evidence on Hand

Approved RoomLab renderers, exact source crops, exported rooms, collision masks, original portrait cards and existing motion machinery. Retained real Gemini evaluation transcripts and request receipts. The previous 25-person economic world's state, bindings and historical implementation remain separately recoverable; they do not drive the new debate format.

## Product Principles

The question and the conversation lead. Preserve accepted history. Keep uncertainty visible without flooding the reader with implementation detail. Fictional perspectives can agree, disagree or revise; never manufacture conflict merely to fill a turn. Save verified changes as incremental commits and publish main through the repository release workflow.
