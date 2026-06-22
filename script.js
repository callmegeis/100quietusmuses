(function () {
  const TOTAL = 100;
  const LEADERBOARD_STORAGE_KEY = "quietusMusesLeaderboard";
  const leaderboardEndpoint = (
    window.QUIETUS_LEADERBOARD_ENDPOINT ||
    document.querySelector('meta[name="leaderboard-endpoint"]')?.content ||
    ""
  ).trim();

  const screens = {
    home: document.getElementById("home-screen"),
    game: document.getElementById("game-screen"),
    lose: document.getElementById("lose-screen"),
    win: document.getElementById("win-screen"),
    leaderboard: document.getElementById("leaderboard-screen")
  };

  const slotGrid = document.getElementById("slot-grid");
  const entryForm = document.getElementById("entry-form");
  const museInput = document.getElementById("muse-input");
  const inputNote = document.getElementById("input-note");
  const timer = document.getElementById("timer");
  const score = document.getElementById("score");
  const progressBar = document.getElementById("progress-bar");
  const namedList = document.getElementById("named-list");
  const winnerForm = document.getElementById("winner-form");
  const winnerNameInput = document.getElementById("winner-name");
  const winnerStatus = document.getElementById("winner-status");
  const leaderboardPlace = document.getElementById("leaderboard-place");
  const leaderboardTable = document.getElementById("leaderboard-table");
  const leaderboardNote = document.getElementById("leaderboard-note");

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
  let pendingWinEntry = null;
  let leaderboardRecords = [];

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function getLeaderboardEndpoint() {
    return leaderboardEndpoint.replace(/\/$/, "");
  }

  function sanitizeWinnerName(value) {
    return normalizeName(value).slice(0, 32);
  }

  function sortLeaderboard(records) {
    return records.slice().sort((a, b) => {
      if (a.timeSeconds !== b.timeSeconds) {
        return a.timeSeconds - b.timeSeconds;
      }

      return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
    });
  }

  function cleanLeaderboardRecords(records) {
    const uniqueRecords = new Map();

    records.forEach((record) => {
      const timeSeconds = Number(record.timeSeconds);
      const name = sanitizeWinnerName(record.name || "");

      if (!name || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
        return;
      }

      uniqueRecords.set(record.id || name + "-" + timeSeconds + "-" + record.completedAt, {
        id: record.id || window.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        name,
        timeSeconds: Math.floor(timeSeconds),
        completedAt: record.completedAt || new Date().toISOString()
      });
    });

    return sortLeaderboard(Array.from(uniqueRecords.values()));
  }

  function getSavedLeaderboard() {
    try {
      return cleanLeaderboardRecords(JSON.parse(window.localStorage.getItem(LEADERBOARD_STORAGE_KEY) || "[]"));
    } catch (error) {
      return [];
    }
  }

  function saveLeaderboard(records) {
    leaderboardRecords = cleanLeaderboardRecords(records);
    window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboardRecords));
    renderLeaderboard();
  }

  function getPlacementForTime(timeSeconds) {
    return leaderboardRecords.filter((record) => record.timeSeconds <= timeSeconds).length + 1;
  }

  function renderLeaderboard() {
    leaderboardTable.innerHTML = "";

    if (!leaderboardRecords.length) {
      const emptyRow = document.createElement("div");
      const rank = document.createElement("strong");
      const label = document.createElement("span");
      const time = document.createElement("em");

      emptyRow.className = "leaderboard-empty";
      rank.textContent = "1";
      label.textContent = "Awaiting first full 100";
      time.textContent = "--:--";
      emptyRow.append(rank, label, time);
      leaderboardTable.appendChild(emptyRow);
    } else {
      leaderboardRecords.forEach((record, index) => {
        const row = document.createElement("div");
        const rank = document.createElement("strong");
        const name = document.createElement("span");
        const time = document.createElement("em");

        rank.textContent = String(index + 1);
        name.textContent = record.name;
        time.textContent = formatTime(record.timeSeconds);

        row.append(rank, name, time);
        leaderboardTable.appendChild(row);
      });
    }

    leaderboardNote.textContent = getLeaderboardEndpoint()
      ? "Completed challenges only. Synced online when available."
      : "Completed challenges only. This browser is keeping the record until an online leaderboard endpoint is connected.";
  }

  async function syncLeaderboard() {
    const endpoint = getLeaderboardEndpoint();

    if (!endpoint) {
      return;
    }

    try {
      const response = await window.fetch(endpoint, { headers: { Accept: "application/json" } });

      if (!response.ok) {
        throw new Error("Leaderboard could not be loaded.");
      }

      const data = await response.json();
      const records = Array.isArray(data) ? data : data.records;

      if (Array.isArray(records)) {
        saveLeaderboard(leaderboardRecords.concat(records));
      }
    } catch (error) {
      leaderboardNote.textContent = "Online leaderboard is unavailable right now. Showing saved records from this browser.";
    }
  }

  async function publishLeaderboardRecord(record) {
    const endpoint = getLeaderboardEndpoint();

    if (!endpoint) {
      return false;
    }

    try {
      const response = await window.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        throw new Error("Leaderboard could not be saved online.");
      }

      const data = await response.json().catch(() => null);
      const records = Array.isArray(data) ? data : data?.records;

      if (Array.isArray(records)) {
        saveLeaderboard(leaderboardRecords.concat(records));
      }

      return true;
    } catch (error) {
      return false;
    }
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
    pendingWinEntry = null;
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
    pendingWinEntry = {
      id: window.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      name: "",
      museCount: TOTAL,
      timeSeconds: elapsedSeconds,
      completedAt: new Date().toISOString()
    };

    document.getElementById("win-time").textContent = finalTime;
    document.getElementById("receipt-time").textContent = finalTime;
    leaderboardPlace.textContent = String(getPlacementForTime(elapsedSeconds));
    winnerForm.classList.remove("is-saved");
    winnerNameInput.value = "";
    winnerNameInput.disabled = false;
    winnerForm.querySelector("button").disabled = false;
    winnerStatus.textContent = "";

    namedList.innerHTML = "";
    namedMuses.forEach((muse) => {
      const item = document.createElement("li");
      item.textContent = muse.name;
      namedList.appendChild(item);
    });

    showScreen("win");
    window.setTimeout(() => winnerNameInput.focus(), 80);
  }

  async function saveWinningName(value) {
    const name = sanitizeWinnerName(value);

    if (!pendingWinEntry || !name) {
      winnerStatus.textContent = "Enter a name to save your completed challenge.";
      return;
    }

    const record = {
      ...pendingWinEntry,
      name
    };

    saveLeaderboard(leaderboardRecords.concat(record));
    leaderboardPlace.textContent = String(leaderboardRecords.findIndex((savedRecord) => savedRecord.id === record.id) + 1);
    winnerStatus.textContent = "Saved locally.";
    winnerNameInput.disabled = true;
    winnerForm.querySelector("button").disabled = true;
    winnerForm.classList.add("is-saved");
    pendingWinEntry = null;

    const synced = await publishLeaderboardRecord(record);
    winnerStatus.textContent = synced ? "Saved to the online leaderboard." : "Saved in this browser.";
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

    if (action === "leaderboard") {
      stopTimer();
      showScreen("leaderboard");
      syncLeaderboard();
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

  winnerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveWinningName(winnerNameInput.value);
  });

  buildSlots();
  setCurrentDate();
  saveLeaderboard(getSavedLeaderboard());
  syncLeaderboard();
})();
