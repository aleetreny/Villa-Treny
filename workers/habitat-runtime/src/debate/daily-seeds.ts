import type { DAILY_DOMAINS } from '../../../../src/lib/debate/contracts';

// Editorial starting points, not assigned resident positions. Each offers a
// reason to want both actions without inventing a technical trap or a villain.
export const CASE_SEEDS = {
  space: [
    'An astronaut is offered a place on a one-way settlement mission. They have wanted this for years; their partner wants to grow old together on Earth and does not want to go.',
    'A settled lunar community can spend its saved funds on a garden for everyday enjoyment or a telescope for discoveries. Gardeners and young researchers both helped raise the money.',
    'A long-voyage crew can send personal messages home, but replies take months. One traveller wants their partner to wait for a reply before making major shared decisions; the partner wants to live their own life meanwhile.',
  ],
  bodies: [
    'An actor is offered their first leading role, which requires cutting the long hair they cherish as part of a family tradition. They want the role and also want to keep that visible connection.',
    'An older parent wants a familiar adult child to help with intimate daily care. The child wants to hire a trusted helper so they can recover some time for their own family; the parent values privacy with strangers.',
    'A keen walker and their less energetic partner have saved for one shared holiday. One wants a demanding trail; the other wants restful days together. Separate activities leave less time with each other.',
  ],
  relationships: [
    'A retired father promised regular childcare so his daughter could take a new job. He now wants to move near his friends by the sea. Paid childcare is available but would take much of her extra income.',
    'Two close friends have kept a weekly evening just for themselves for years. One wants to bring a new partner; the other misses having one place to talk privately without an audience.',
    'A couple both love their current home. One receives a job offer elsewhere that they have wanted for years; the other has work and friends they do not want to leave. Living apart is possible but costly to their shared life.',
  ],
  work: [
    'Two colleagues built a successful project together, but only one can take its leadership role. One did the strongest technical work; the other kept the team together and wants a first chance to lead.',
    'Workers can vote to automate a tiring task. It would make shifts easier, but the employer offers shorter paid hours rather than replacement tasks. Some want the time back; others need the current pay.',
    'A small bakery can accept a lucrative regular order that requires opening on the evening its staff usually spend with their families. The extra income and the lost time both matter to the staff.',
  ],
  culture: [
    'A late writer asked a friend to destroy an unfinished novel. The friend has read it, thinks it is wonderful and wants others to have it. The writer wanted control over which work represented them.',
    'A musician is offered a larger audience if they perform a beloved family song in another language. They want more people to hear it and also care about keeping its original words alive.',
    'A family owns a painting made by their grandmother. A museum offers to display it to many people, but the family would lose the picture they see together at home every day.',
  ],
  justice: [
    'A contest winner admits they quietly used help forbidden by the rules. Returning the prize would recognise those who followed the rules; letting them keep it after an apology would recognise an honest confession.',
    'A neighbour who damaged a shared garden has repaired it and apologised. Others must decide whether to welcome them back immediately or keep an agreed temporary exclusion that still has weeks to run.',
    'A teenager has saved to replace a window they broke. The owner can afford the repair and knows the money was meant for the teenager’s first trip with friends. They must decide what making amends should cost.',
  ],
  education: [
    'A teacher has one funded place on a learning trip. One pupil has consistently done the best work; another is eager but could never afford a similar trip. Both want to go.',
    'A student wins a place on a prestigious course their parents helped them prepare for, but now prefers a less certain path making music. The parents value the chance; the student wants a life they chose.',
    'Pupils want to replace some exam practice with a project they chose together. Their teacher likes the project but knows the lost practice matters to pupils who want high exam results.',
  ],
  nature: [
    'A family’s free-roaming cat has been seen catching garden birds. Keeping it indoors would protect birds, but the cat enjoys roaming and complains when shut inside. The family cares about both.',
    'Beavers have made a wetland where people now enjoy watching wildlife, while flooding part of a farmer’s field. Keeping the wetland costs the farmer usable land; removing the dam costs the habitat.',
    'A village can build needed homes on a small orchard residents planted years ago. People want their grown children to live nearby; others want to keep the fruit, shade and living trees.',
  ],
  technology: [
    'A person uses a familiar voice tool to recreate a dead parent reading bedtime stories from old recordings. They find it comforting; their sibling finds the new words in that voice upsetting. Both cherish the recordings.',
    'Two partners use a location-sharing app. One feels reassured by knowing the other arrived safely; the other wants to stop sharing because ordinary private time matters to them. Neither has betrayed the other.',
    'An amateur illustrator can use an image tool to finish a story for their child much sooner. They also value drawing it themselves and the child enjoys watching them make it. Time, authorship and shared pleasure all matter.',
  ],
  belief: [
    'A nonreligious adult is asked to join a spoken prayer at a parent’s important ceremony. They want to honour the parent but do not want to say words they do not believe.',
    'A couple with different beliefs wants a wedding that feels honest to both. One wants a family religious ritual; the other wants a ceremony with no religious promises. Their families care, too.',
    'A host follows a strict food tradition and wants everyone to share one meal. A close guest asks to bring a dish outside that tradition because it carries their own family memories.',
  ],
  democracy: [
    'A neighbourhood votes to turn a quiet shared square into a weekend market. Most want the activity and income; residents beside the square cherish the quiet they chose their homes for.',
    'A village must decide whether teenagers get a vote on spending saved money for a new recreation space. Adults contributed the money; teenagers will use the place for years.',
    'A club’s founding members promised to keep membership small. New members now form a majority and want to open it widely. Both groups value the club but want different futures for it.',
  ],
  knowledge: [
    'An adult finds letters showing that a much-loved family story is untrue. A relative wants to keep telling it because it brings the family together; the finder wants the real person to be remembered.',
    'An artist asks a friend for an honest opinion before their first exhibition. The friend dislikes the work and wants to be truthful, but also wants the artist to enjoy a brave first attempt.',
    'A person receives an unopened letter a former partner left for them years ago. They are happy now and curious about what happened, but opening it could disturb a peace they worked hard to find.',
  ],
} satisfies Record<typeof DAILY_DOMAINS[number], readonly string[]>;
