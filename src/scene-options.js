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
    alt: "If you can't reach them, draw the threat away from the downed ally or call out where it is so someone closer can help.",
    question: "Who is down, and can I see or reach them from here?"
  },
  {
    name: "Combat", tag: "combat",
    match: /\b(?:initiative|attack\w*|fight(?:s|ing)?|battle|ambush\w*|combat|enem(?:y|ies)|hostile|firing|fires (?:at|on|a|his|her|their)|opens? fire|shoot(?:s|ing)?|shot at|lunges?|stabs?|slash\w*|bites?|claws? at|swoops? (?:at|down|in|toward)|strikes? (?:at|you|him|her|them|the)|hits? (?:you|him|her|them|the)|damage|draws? (?:\w+ )?(?:swords?|muskets?|weapons?|blades?|bows?)|swings? (?:at|a|his|her|their)|charges? (?:at|you|us|toward)|your turn)\b/i,
    moves: {
      cleric: "If Sacred Flame is available, pick a visible enemy in range. If allies need support and Bless is prepared, check whether you can spend a slot and concentrate.",
      ranger: "Ask what you can see from your position, then pick a target you can reach with your equipped weapon without exposing yourself to more enemies.",
      barbarian: "Check whether you can reach the closest threat this turn. If Rage is available, decide whether to spend a use before committing.",
      brawler: "Approach an enemy you can reach this turn. Ask whether your sheet's attack or a grapple would better protect the closest ally.",
      rogue: "Look for a target that meets your sheet's Sneak Attack conditions and a place to move afterward."
    },
    fallback: "Identify a target your sheet lets you reach this turn, or move to a position that protects an ally.",
    alt: "If nothing good is in reach, take cover or move to shield the most exposed ally, and tell the table what you're doing.",
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
    alt: "Watch the approach while someone else works on it, and agree what the group does if the noise draws attention.",
    question: "What kind of lock is it, and are there signs it is trapped?"
  },
  {
    name: "Something is approaching", tag: "danger",
    match: /\b(?:footsteps?|approach\w*|getting closer|pursu\w*|patrol\w*|alarms?|shadows? (?:move|moving)|encounter\w*|appears?|emerges?|bursts? (?:in|out|through))\b/i,
    moves: {
      cleric: "Get an ally into cover and identify the source of the sound. If trouble is imminent, check whether you have time and a prepared support spell.",
      ranger: "Get out of the approaching creature's line of sight. Watch the route it would take and signal the party when you can identify it.",
      barbarian: "Take a position between the approach and a vulnerable ally. Ask how far away the threat sounds before deciding whether to intercept.",
      brawler: "Use a nearby obstacle to cover the group's exit. Stay close enough to help if someone gets cut off.",
      rogue: "Break line of sight and listen from cover. Look for a way around the approaching figure."
    },
    fallback: "Move out of sight of the approach, or scout a nearby exit if you can do so without exposing the group.",
    alt: "Agree on a plan with the party before it arrives: hide, talk, or fight.",
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
    alt: "Ask whether anyone has a tool, spell, or object that could test the hazard from a distance.",
    question: "What appears to trigger it, and what can I inspect from where I'm standing?"
  },
  {
    name: "Looking for someone", tag: "social",
    match: /\b(?:look(?:s|ing)? for|search(?:es|ing)? for|track(?:s|ing)? (?:down|them)|find (?:a|an|the|someone|somebody)|shady|suspicious|stranger|hooded|cloaked|informant|contact|individual|lookout)\b/i,
    moves: {
      cleric: "Take a seat where you can see the room and watch for someone avoiding eye contact. Ask the barkeep who doesn't belong here.",
      ranger: "Scan the room from a corner: who keeps watching the door, who is alone, who left in a hurry? Point them out quietly to the party.",
      barbarian: "Stay near the door so no one slips out, and let a smoother talker approach first.",
      brawler: "Back up whoever makes contact. Stand close enough to step in if the meeting turns rough.",
      rogue: "Drift through the crowd and listen for the person everyone else is avoiding."
    },
    fallback: "Watch the room for someone who seems out of place, and agree with the party who makes contact and who keeps watch.",
    alt: "Ask a server or barkeep, casually, who might fit the description. Offer a coin or a drink for a name.",
    question: "Who stands out in the room, and does anyone seem to be watching us?"
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
    alt: "Let another character lead the talk while you watch the NPC's hands, the exits, and anyone listening nearby.",
    question: "What does this person seem to want, and is there anything I can tell about their reaction?"
  }
];

situations.push({
  name: "On the move", tag: "explore",
  match: /\b(?:take(?:s)? the party|head(?:s|ing)? (?:to|out|over|into|for)|across the (?:way|street|square|road)|travel\w*|leav(?:e|es|ing) the|arriv\w*|walk(?:s|ing)? (?:to|into|over|out)|go(?:es|ing)? (?:to|into|over)|tavern|inn|alley|street|market|docks|city gate)\b/i,
  moves: {
    cleric: "Before you go, check on anyone who is hurt and decide whether a quick heal now is worth a slot.",
    ranger: "Move ahead or at the back and watch whether anyone follows you out.",
    barbarian: "Walk at the front where trouble would hit first, and stay close enough to the party to help.",
    brawler: "Stay beside the most vulnerable party member while you move.",
    rogue: "Watch for tails and note exits at the new location as you arrive."
  },
  fallback: "Agree on the plan before you arrive: who talks, who watches the exits, and what you are looking for.",
  alt: "Ask the DM what you notice on the way and whether anyone is following.",
  question: "What do we see on the way and when we arrive, and is anyone following us?"
});

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
  alt: "Ask the party what they want to accomplish next and offer to scout, search, or keep watch.",
  question: "What stands out from my position, and what can I investigate without moving?"
};

const rolePattern = /cleric|ranger|barbarian|brawler|fighter|gladiator|rogue/i;
const roleAlias = { fighter: "brawler", gladiator: "brawler" };
const ending = /\b(?:fight (?:is |has )?(?:over|ended)|combat (?:is |has )?(?:over|ended)|end of combat|no enemies remain|last enemy (?:falls|is down)|out of combat)\b/i;

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

const stopWords = new Set("about after again also before being check could from have here into just only over that their them then there they this what when where which while will with would your you".split(" "));
const words = text => new Set((text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter(word => !stopWords.has(word)));
const abilityName = move => move.split(" — ")[0].trim();

// Combat persists across updates until the DM says it ended, so "the captain
// says nothing" mid-fight still reads as combat.
function combatActive(scenes) {
  for (const scene of scenes.slice(-8).reverse()) {
    const sentences = scene.text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).reverse();
    for (const sentence of sentences) {
      if (ending.test(sentence)) return false;
      if (situations[1].match.test(sentence)) return true;
    }
  }
  return false;
}

function pickAbility(candidates, sceneText, seed) {
  if (!candidates.length) return undefined;
  const scene = words(sceneText);
  const scored = candidates.map(move => ({ move, score: [...words(move)].filter(word => scene.has(word)).length }));
  const best = Math.max(...scored.map(item => item.score));
  // One shared word ("casino") isn't evidence; only a stronger match wins
  // outright. Otherwise rotate through the abilities as new updates arrive.
  const top = best >= 2 ? scored.filter(item => item.score === best) : scored;
  return top[seed % top.length].move;
}

export function recommend(character, scenes) {
  const latest = scenes.at(-1);
  const text = latest?.text ?? "";
  const detected = latestSituation(text);
  const prior = scenes.slice(-4, -1).reverse().map(scene => latestSituation(scene.text)).find(Boolean);
  const continuation = /^(?:it|they|he|she|that|then|still)\b/i.test(text);
  let found = detected ?? (continuation ? prior : null) ?? { rule: exploration, detail: text };
  if (["social", "explore"].includes(found.rule.tag) && combatActive(scenes)) found = { rule: situations[1], detail: text };
  const { rule, detail } = found;
  const matched = character.role.match(rolePattern)?.[0].toLowerCase();
  const role = roleAlias[matched] ?? matched;
  const moves = parseMoves(character).filter(([tag, move]) => move && tag !== "check");
  const tagged = moves.filter(([tag]) => tag === rule.tag).map(([, move]) => move);
  const general = moves.filter(([tag]) => tag === "any").map(([, move]) => move);
  const seed = Number(latest?.id) || 0;
  const ability = pickAbility(tagged.length ? tagged : general, text, seed);
  const tactic = rule.moves[role] ?? rule.fallback;
  const options = [];
  if (ability) options.push("From your sheet, if available: " + ability);
  const name = ability && abilityName(ability).toLowerCase();
  const repeats = name && name.length > 3 && tactic.toLowerCase().includes(name);
  if (!repeats) options.push(tactic);
  if (options.length < 2) {
    const another = pickAbility(tagged.filter(move => move !== ability), text, seed);
    options.push(another ? "Also on your sheet: " + another : rule.alt);
  }
  if (options.length < 2) options.push(rule.alt);
  return { situation: rule.name, detail, options: options.slice(0, 2), question: rule.question };
}

export function coachingPrompt(character, scenes) {
  const updates = scenes.slice(-20).map(scene => "- " + scene.text).join("\n");
  return [
    "Help me decide what my D&D character can do next. Use our campaign context if you have it.",
    "Character: " + character.name + (character.role ? " (" + character.role + ")" : ""),
    "Known abilities and limits: " + (character.moves.trim() || "Use only abilities already confirmed in our conversation; ask about anything missing."),
    "DM updates, oldest to newest:\n" + updates,
    "First tell me in a sentence or two what you think the DM is building toward, using our campaign history and these updates (as a theory, not a fact). Then give me two or three concrete options for this scene that also move us toward that bigger picture, including action economy, cost, concentration, or range where relevant. Flag assumptions, distinguish possible actions from DM-confirmed outcomes, and do not invent resources or rules."
  ].join("\n\n");
}
