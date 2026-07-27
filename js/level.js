(function () {
  var BASE_XP = 500;

  function fromXp(value) {
    var totalXp = Math.max(0, Math.floor(Number(value) || 0));
    var level = 1;
    var levelStartXp = 0;
    var requiredXp = BASE_XP;

    while (totalXp >= levelStartXp + requiredXp && level < 100) {
      levelStartXp += requiredXp;
      level += 1;
      requiredXp = BASE_XP * level;
    }

    var currentXp = totalXp - levelStartXp;
    return {
      level: level,
      totalXp: totalXp,
      currentXp: currentXp,
      requiredXp: requiredXp,
      nextLevelXp: levelStartXp + requiredXp,
      percent: Math.max(0, Math.min(100, currentXp / requiredXp * 100))
    };
  }

  window.QUESTER_LEVELS = {
    baseXp: BASE_XP,
    fromXp: fromXp
  };
})();
