const situations = [
  {
    name: "An ally needs help", tag: "aid",
    match: /\b(?:unconscious|bleeding|wounded|injured|downed|dying|death saves?|(?:zero|0) (?:hp|hit points))\b/i,
    moves: {
      cleric: "If Healing Word is prepared, an ally you can see is in range, and you have a slot, consider using your bonus action to bring them back up.",
      ranger: "Use your position to cover the injured ally's approach. Tell the party if reaching them would expose someone else.",
      barbarian: "Move between the injured ally and the threat if you can get there. Ask whether you can move the ally to safety.",
      brawler: "Get beside the injured ally and ask whether you can block an approach or help move them safely."
    },
    fallback: "Check whether you can reach the injured ally safely. Ask what it would take to stabilize or move them.",
    question: "Who is down, and can I see or reach them from here?"
  },
  {
    name: "Combat", tag: "combat",
    match: /\b(?:roll initiative|attacks?|enemies|enemy|hostile|firing|draws? (?:\w+ )?(?:swords?|muskets?|weapons?)|swings? (?:at|a|his|her)|opens? fire|charges? (?:at|you|us)|combat begins)\b/i,
    moves: {
      cleric: "If Sacred Flame is available, pick a visible enemy in range. If allies need support and Bless is prepared, check whether you can spend a slot and concentrate.",
      ranger: "Ask what you can see from your position, then pick a target you can reach with your equipped weapon without exposing yourself to more enemies.",
      barbarian: "Check whether you can reach the closest threat this turn. If Rage is available, decide whether to spend a use before committing.",
      brawler: "Approach an enemy you can reach this turn. Ask whether your sheet's attack or a grapple would better protect the closest ally.",
      rogue: "Look for a target that meets your sheet's Sneak Attack conditions and a place to move afterward."
    },
    fallback: "Identify a target your sheet lets you reach this turn, or move to a position that protects an ally.",
    question: "Which targets can I reach or see, and is anyone in immediate danger?"
  },
  {
    name: "A locked way forward", tag: "explore",
    match: /\b(?:lock(?:ed|pick|s)?|barred|jammed|keyhole|bolted)\b/i,
    moves: {
      cleric: "Inspect the lock or barrier for a visible mark, seal, or ward before anyone touches it.",
      ranger: "Check the hinges, frame, and surrounding floor for signs someone opened or bypassed the barrier.",
      barbarian: "Check for a key or an alternate route first. If the group accepts the noise, ask the DM what forcing the barrier would take.",
      brawler: "Check whether the barrier can be braced or shifted without making noise. Coordinate who watches the approach while you try.",
      rogue: "Inspect the lock for traps, then try thieves' tools if your sheet has them and the DM says you can reach it."
    },
    fallback: "Inspect the lock and frame before touching them. Look for a key, an alternate entrance, or signs of a trap.",
    question: "What kind of lock is it, and are there signs it is trapped?"
  },
  {
    name: "Something is approaching", tag: "danger",
    match: /\b(?:footsteps?|approach\w*|getting closer|pursu\w*|patrol\w*|alarms?|shadows? (?:move|moving))\b/i,
    moves: {
      cleric: "Get an ally into cover and identify the source of the sound. If trouble is imminent, check whether you have time and a prepared support spell.",
      ranger: "Get out of the approaching creature's line of sight. Watch the route it would take and signal the party when you can identify it.",
      barbarian: "Take a position between the approach and a vulnerable ally. Ask how far away the threat sounds before deciding whether to intercept.",
      brawler: "Use a nearby obstacle to cover the group's exit. Stay close enough to help if someone gets cut off.",
      rogue: "Break line of sight and listen from cover. Look for a way around the approaching figure."
    },
    fallback: "Move out of sight of the approach, or scout a nearby exit if you can do so without exposing the group.",
    question: "Where is the sound coming from, and how much time do we have?"
  },
  {
    name: "A possible hazard", tag: "danger",
    match: /\b(?:traps?|tripwire|pressure plate|poison gas|smoke|flames?|collaps\w*|crumbl\w*)\b/i,
    moves: {
      cleric: "Keep the group back and check whether the hazard looks magical. Ask what you can learn from your current position.",
      ranger: "Mark where the danger starts and look for a safer route around it.",
      barbarian: "Ward people away from the hazard and ask whether there's a way to test the route from safety.",
      rogue: "Inspect the trigger from a safe square and ask whether your tools could disable it."
    },
    fallback: "Stop short of the hazard and tell the group what you saw. Look for a route or a way to inspect it from safety.",
    question: "What appears to trigger it, and what can I inspect from where I'm standing?"
  },
  {
    name: "Someone can be questioned", tag: "social",
    match: /\b(?:says?|asks?|speaks?|bartender|parley|negotia\w*|persua\w*|offers?|demands?|knows?|refus\w*)\b/i,
    moves: {
      cleric: "Ask one concrete question about what the NPC actually saw. Offer help if that gives them a reason to answer.",
      ranger: "Ask who passed through recently and which way they went. Listen for a detail you can check against the scene.",
      barbarian: "Ask directly what the NPC wants and what they know. Give them space to answer before escalating.",
      brawler: "Back up the party member talking. Watch how the NPC and anyone nearby react.",
      rogue: "Ask a low-pressure question and watch for a reaction that suggests the NPC is holding back."
    },
    fallback: "Ask one question that would change the party's next move. Watch the NPC's reaction before pressing further.",
    question: "What does this person seem to want, and is there anything I can tell about their reaction?"
  }
];

const exploration = {
  name: "Exploration", tag: "explore",
  moves: {
    cleric: "Inspect a visible clue for a mark, seal, or sign of magic. If the group needs light, check what you can use without giving away your position.",
    ranger: "Look for tracks, disturbed dust, or another sign of recent movement. Share the safest route you can see.",
    barbarian: "Offer to take point while another player watches the group's exit. Check what you can reach before committing.",
    brawler: "Check for a clear exit and a place the party can regroup if the route ahead is blocked.",
    rogue: "Search for concealed features or signs of tampering before the party commits to a route."
  },
  fallback: "Inspect the nearest visible clue or obstacle. Coordinate who watches the exit while you do it.",
  question: "What stands out from my position, and what can I investigate without moving?"
};

const rolePattern = /cleric|ranger|barbarian|brawler|rogue/i;
const ending = /\b(?:fight (?:is |has )?over|combat (?:is |has )?ended|no enemies remain|last enemy (?:falls|is down))\b/i;

function latestSituation(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  for (const sentence of sentences.reverse()) {
    if (ending.test(sentence)) return { rule: exploration, detail: sentence };
    const rule = situations.find(item => item.match.test(sentence));
    if (rule) return { rule, detail: sentence };
  }
  return null;
}

function parseMoves(character) {
  return character.moves.split("\n").map(line => {
    const separator = line.indexOf("|");
    return separator < 0 ? ["any", line.trim()] : [
      line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()
    ];
  });
}

export function characterAbilities(character) {
  const moves = parseMoves(character).filter(([, move]) => move);
  return {
    ready: [...new Set(moves.filter(([tag]) => tag !== "check").map(([, move]) => move))],
    check: moves.filter(([tag]) => tag === "check").map(([, move]) => move)
  };
}

export function recommend(character, scenes) {
  const latest = scenes.at(-1);
  const detected = latestSituation(latest?.text ?? "");
  const prior = scenes.slice(-4, -1).reverse().map(scene => latestSituation(scene.text)).find(Boolean);
  const continuation = /^(?:it|they|he|she|that|then|still)\b/i.test(latest?.text ?? "");
  const { rule, detail } = detected ?? (continuation ? prior : null) ?? { rule: exploration, detail: latest?.text };
  const role = character.role.match(rolePattern)?.[0].toLowerCase();
  const moves = parseMoves(character);
  const preferred = moves.find(([tag, move]) => tag === rule.tag && move)
    ?? moves.find(([tag, move]) => tag === "any" && move);
  const options = [rule.moves[role] ?? rule.fallback];
  if (preferred) options.unshift("From your sheet, if available: " + preferred[1]);
  return { situation: rule.name, detail, options, question: rule.question };
}

export function coachingPrompt(character, scenes) {
  const updates = scenes.slice(-5).map(scene => "- " + scene.text).join("\n");
  return [
    "Help me decide what my D&D character can do next. Use our campaign context if you have it.",
    "Character: " + character.name + (character.role ? " (" + character.role + ")" : ""),
    "Known abilities and limits: " + (character.moves.trim() || "Use only abilities already confirmed in our conversation; ask about anything missing."),
    "DM updates, oldest to newest:\n" + updates,
    "Give me two or three concrete options for this scene, including action economy, cost, concentration, or range where relevant. Flag assumptions, distinguish possible actions from DM-confirmed outcomes, and do not invent resources or rules."
  ].join("\n\n");
}
