(function () {
  const TOTAL = 100;

  const screens = {
    home: document.getElementById("home-screen"),
    game: document.getElementById("game-screen"),
    lose: document.getElementById("lose-screen"),
    win: document.getElementById("win-screen")
  };

  const slotGrid = document.getElementById("slot-grid");
  const entryForm = document.getElementById("entry-form");
  const museInput = document.getElementById("muse-input");
  const inputNote = document.getElementById("input-note");
  const timer = document.getElementById("timer");
  const score = document.getElementById("score");
  const progressBar = document.getElementById("progress-bar");
  const namedList = document.getElementById("named-list");

  const masterlist = Array.isArray(window.QUIETUS_MUSES) ? window.QUIETUS_MUSES : [];
  const struckNameAliases = {
    "Saharlyn bint Esmail ibn Nasir al-Amuli (Original Character)": ["Saharlyn"],
    "Jack Jacqueline \"Jack\" Tobey": ["Jack"]
  };
  const museLookup = buildMuseLookup(masterlist);

  let namedMuses = [];
  let startTime = 0;
  let elapsedSeconds = 0;
  let timerHandle = null;

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function showScreen(name) {
    Object.values(screens).forEach((screen) => screen.classList.remove("is-active"));
    screens[name].classList.add("is-active");
  }

  function normalizeName(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function normalizeSearchKey(value) {
    return normalizeName(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .toLocaleLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function searchKeysFor(value) {
    const key = normalizeSearchKey(value);
    const compactKey = key.replace(/\s+/g, "");
    return key && compactKey !== key ? [key, compactKey] : [key];
  }

  function addAlias(aliases, value) {
    const alias = normalizeName(value);

    if (alias) {
      aliases.add(alias);
    }
  }

  function isIgnoredParentheticalAlias(value) {
    return /^original charac(?:ter|er)$/i.test(value) ||
      /^alter$/i.test(value) ||
      /\boc$/i.test(value) ||
      /\bpc$/i.test(value) ||
      /\bprotagonist$/i.test(value);
  }

  function addQuotedAliases(aliases, value) {
    Array.from(value.matchAll(/["“]([^"”]+)["”]/g)).forEach((match) => addAlias(aliases, match[1]));
    Array.from(value.matchAll(/(?:^|\s)'([^']+)'(?=\s|$)/g)).forEach((match) => addAlias(aliases, match[1]));
  }

  function getMuseAliases(name) {
    const aliases = new Set();
    const parentheticalMatches = name.matchAll(/\(([^()]+)\)/g);
    const nonAliasParenthetical = /\(\s*original character\s*\)/gi;
    const baseName = name.replace(nonAliasParenthetical, " ");

    addAlias(aliases, name);
    (struckNameAliases[name] || []).forEach((alias) => addAlias(aliases, alias));
    addQuotedAliases(aliases, name);

    baseName.split("/").forEach((part) => {
      addAlias(aliases, part);
      addAlias(aliases, part.replace(/\s*\([^)]*\)\s*/g, " "));
      addQuotedAliases(aliases, part);
    });

    Array.from(parentheticalMatches).forEach((match) => {
      const parentheticalAlias = match[1].trim();
      const previousName = parentheticalAlias.match(/^prev\.\s*(.+)$/i);

      if (previousName) {
        addAlias(aliases, previousName[1]);
        return;
      }

      if (!isIgnoredParentheticalAlias(parentheticalAlias)) {
        addAlias(aliases, parentheticalAlias);
      }
    });

    return Array.from(aliases);
  }

  function getFirstNameKeys(alias) {
    const key = normalizeSearchKey(alias);
    const words = key.split(" ").filter(Boolean);

    if (words.length < 2) {
      return [];
    }

    return searchKeysFor(words[0]);
  }

  function buildMuseLookup(entries) {
    const aliasIndex = new Map();
    const firstNameKeys = new Set();

    entries.forEach((entry, index) => {
      const muse = {
        id: index,
        name: entry.name,
        series: entry.series,
        writer: entry.writer,
        aliases: getMuseAliases(entry.name)
      };

      muse.aliases.forEach((alias) => {
        searchKeysFor(alias).forEach((key) => {
          if (key) {
            if (!aliasIndex.has(key)) {
              aliasIndex.set(key, []);
            }

            aliasIndex.get(key).push(muse);
          }
        });

        getFirstNameKeys(alias).forEach((key) => firstNameKeys.add(key));
      });
    });

    return { aliasIndex, firstNameKeys };
  }

  function setInputNote(message, type) {
    inputNote.textContent = message;
    inputNote.classList.toggle("is-success", type === "success");
    inputNote.classList.toggle("is-warning", type === "warning");
  }

  function getDisplaySeries(series) {
    return /^Original Charact(?:er|rer)s/i.test(series) ? "Original Characters" : series;
  }

  function findMuse(value) {
    const keys = searchKeysFor(value).filter(Boolean);
    const matches = [];

    keys.forEach((key) => {
      (museLookup.aliasIndex.get(key) || []).forEach((muse) => {
        if (!matches.some((match) => match.id === muse.id)) {
          matches.push(muse);
        }
      });
    });

    if (matches.length) {
      return {
        status: "found",
        muse: matches.find((match) => !namedMuses.some((savedMuse) => savedMuse.id === match.id)) || matches[0]
      };
    }

    const isFirstNameOnly = keys.some((key) => museLookup.firstNameKeys.has(key));

    return { status: isFirstNameOnly ? "partial" : "missing" };
  }

  function buildSlots() {
    slotGrid.innerHTML = "";

    for (let index = 1; index <= TOTAL; index += 1) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.index = String(index);
      slot.textContent = index;
      slotGrid.appendChild(slot);
    }
  }

  function updateBoard() {
    const slots = slotGrid.querySelectorAll(".slot");

    slots.forEach((slot, index) => {
      const muse = namedMuses[index];
      slot.textContent = muse ? muse.name : index + 1;
      slot.classList.toggle("is-filled", Boolean(muse));
    });

    score.textContent = String(namedMuses.length);
    progressBar.style.width = namedMuses.length + "%";
  }

  function tick() {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    timer.textContent = formatTime(elapsedSeconds);
  }

  function stopTimer() {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function startGame() {
    namedMuses = [];
    elapsedSeconds = 0;
    setInputNote("", "");
    museInput.value = "";
    updateBoard();
    showScreen("game");

    startTime = Date.now();
    tick();
    stopTimer();
    timerHandle = window.setInterval(tick, 1000);
    window.setTimeout(() => museInput.focus(), 80);
  }

  function addMuse(value) {
    const name = normalizeName(value);

    if (!name) {
      return;
    }

    const result = findMuse(name);

    if (result.status === "partial") {
      setInputNote("Please type the muse's full name or alias", "warning");
      return;
    }

    if (result.status === "missing") {
      setInputNote("This muse is currently not in Quietus", "warning");
      return;
    }

    const muse = result.muse;
    const exists = namedMuses.some((savedMuse) => savedMuse.id === muse.id);

    if (exists) {
      setInputNote(muse.name + " is already on your list.", "warning");
      return;
    }

    namedMuses.push(muse);
    museInput.value = "";
    setInputNote(muse.name + " - from " + getDisplaySeries(muse.series) + ", written by " + muse.writer + "!", "success");
    updateBoard();

    if (namedMuses.length === TOTAL) {
      winGame();
    }
  }

  function loseGame() {
    stopTimer();
    document.getElementById("lose-count").textContent = String(namedMuses.length);
    document.getElementById("lose-copy-count").textContent = String(namedMuses.length);
    document.getElementById("lose-time").textContent = formatTime(elapsedSeconds);
    showScreen("lose");
  }

  function winGame() {
    stopTimer();
    const finalTime = formatTime(elapsedSeconds);

    document.getElementById("win-time").textContent = finalTime;
    document.getElementById("receipt-time").textContent = finalTime;

    namedList.innerHTML = "";
    namedMuses.forEach((muse) => {
      const item = document.createElement("li");
      item.textContent = muse.name;
      namedList.appendChild(item);
    });

    showScreen("win");
  }

  function downloadScreenshot() {
    const width = 1200;
    const height = 1600;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const finalTime = formatTime(elapsedSeconds);

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#090806";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#f6aa19";
    for (let x = 20; x < width; x += 26) {
      for (let y = 20; y < height; y += 26) {
        context.globalAlpha = 0.26;
        context.fillRect(x, y, 2, 2);
      }
    }
    context.globalAlpha = 1;

    context.fillStyle = "#fff7df";
    context.font = "900 56px Nunito, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("Name 100 Quietus Muses", width / 2, 100);

    context.fillStyle = "#f6aa19";
    context.font = "900 32px Nunito, Arial, sans-serif";
    context.fillText("Completed in " + finalTime, width / 2, 150);

    context.textAlign = "left";
    context.font = "700 22px Nunito, Arial, sans-serif";
    context.fillStyle = "#fff7df";

    const columns = 4;
    const rows = 25;
    const columnWidth = 270;
    const startX = 70;
    const startY = 225;
    const lineHeight = 46;

    namedMuses.forEach((muse, index) => {
      const column = Math.floor(index / rows);
      const row = index % rows;
      const x = startX + column * columnWidth;
      const y = startY + row * lineHeight;
      context.fillStyle = "#f6aa19";
      context.fillText(String(index + 1).padStart(2, "0") + ".", x, y);
      context.fillStyle = "#fff7df";
      context.fillText(muse.name.slice(0, 20), x + 44, y);
    });

    const link = document.createElement("a");
    link.download = "name-100-quietus-muses.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function setCurrentDate() {
    const date = new Date();
    document.getElementById("current-date").textContent = date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === "start" || action === "restart") {
      startGame();
    }

    if (action === "home") {
      stopTimer();
      showScreen("home");
    }

    if (action === "giveup") {
      loseGame();
    }

    if (action === "screenshot") {
      downloadScreenshot();
    }
  });

  entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addMuse(museInput.value);
  });

  buildSlots();
  setCurrentDate();
})();
