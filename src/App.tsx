
import React, { useEffect, useMemo, useState } from "react";
import { QUOTES } from "./quotes";
import "./App.css";

type Screen = "home" | "kid" | "parent" | "reports";
type ReportPeriod = "1M" | "3M" | "LIFETIME";

type ChoreDef = {
  id: number;
  name: string;
  points: number;
  category: string;
  unlimitedPerWeek: boolean;
  allowParentOverride: boolean;
};

type Chore = ChoreDef & {
  doneCount: number;
};

type Kid = {
  id: number;
  name: string;
  chores: Chore[];
  customChores: Chore[];
  dishesLoadDone: boolean;
  dishesUnloadDone: boolean;
  bathroomAssigned: boolean;
  bathroomDone: boolean;
  carryoverPoints: number;
  dishPenaltyPoints: number;
  weeksTracked: number;
  weeksSuccessful: number;
};

type GroceryItem = {
  id: number;
  name: string;
  addedAt: string;
};

type CompletionEvent = {
  id: number;
  kidId: number;
  kidName: string;
  choreId: number;
  choreName: string;
  points: number;
  at: string;
  kind: "library" | "custom" | "bathroom" | "dishes";
};

type DogCare = {
  amFedAt: string | null;
  pmFedAt: string | null;
  chiefMedsAt: string | null;
};

type AppState = {
  kids: Kid[];
  library: ChoreDef[];
  dogCare: DogCare;
  groceryItems: GroceryItem[];
  groceryQuickAdds: string[];
  completionEvents: CompletionEvent[];
  parentPin: string;
  lastWeekKey: string;
};

const VERSION = "v5.5.26c";
const STORAGE_KEY = "hadtieri_house_v21_clean";
const BASE_POINTS = 5;
const BATHROOM_POINTS = 2;
const DISH_PENALTY = 3;
const DEFAULT_PIN = "5422";
const KID_NAMES = ["Morgan", "Marilyn", "James", "Calvin", "Anastasia", "Evie"];

const DEFAULT_LIBRARY: ChoreDef[] = [
  { id: 1, name: "Brush Dogs", points: 1, category: "Pets", unlimitedPerWeek: true, allowParentOverride: false },
  { id: 2, name: "Fold Laundry", points: 2, category: "Laundry", unlimitedPerWeek: false, allowParentOverride: true },
  { id: 3, name: "Make Bed", points: 1, category: "Room", unlimitedPerWeek: false, allowParentOverride: false },
  { id: 4, name: "Pick Up Bedroom", points: 1, category: "Room", unlimitedPerWeek: false, allowParentOverride: false },
  { id: 5, name: "Trash", points: 1, category: "House", unlimitedPerWeek: false, allowParentOverride: false },
  { id: 6, name: "Vacuum", points: 2, category: "House", unlimitedPerWeek: false, allowParentOverride: true },
  { id: 7, name: "Wipe Counters", points: 1, category: "Kitchen", unlimitedPerWeek: false, allowParentOverride: false },
];

const DEFAULT_GROCERY_QUICK_ADDS = [
  "Milk", "Eggs", "Bread", "Butter", "Cheese", "Yogurt", "Orange Juice",
  "Apples", "Bananas", "Grapes", "Strawberries", "Blueberries", "Oranges",
  "Lettuce", "Tomatoes", "Onions", "Potatoes", "Carrots", "Broccoli",
  "Chicken", "Ground Beef", "Hot Dogs", "Lunch Meat", "Bacon", "Pasta", "Rice",
  "Cereal", "Oatmeal", "Chips", "Crackers", "Granola Bars", "Fruit Snacks",
  "Paper Towels", "Toilet Paper", "Trash Bags", "Dish Soap", "Laundry Detergent",
  "Dog Food", "Dog Treats", "Chief Meds",
];


function normalizeLibrary(raw: unknown): ChoreDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return sortByName(DEFAULT_LIBRARY);

  return sortByName(
    raw.map((item: any, index: number) => ({
      id: Number(item?.id ?? Date.now() + index),
      name: String(item?.name ?? "Chore"),
      points: Math.max(0, Number(item?.points ?? 1)),
      category: String(item?.category ?? "General"),
      unlimitedPerWeek: Boolean(item?.unlimitedPerWeek),
      allowParentOverride: Boolean(item?.allowParentOverride),
    }))
  );
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekEnd(date = new Date()) {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00d 00h 00m 00s";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(d).padStart(2, "0")}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function makeChores(library: ChoreDef[]): Chore[] {
  return sortByName(library).map((chore) => ({ ...chore, doneCount: 0 }));
}

function completedPoints(kid: Kid) {
  return (
    kid.chores.reduce((sum, chore) => sum + chore.points * chore.doneCount, 0) +
    kid.customChores.reduce((sum, chore) => sum + chore.points * chore.doneCount, 0) +
    (kid.bathroomAssigned && kid.bathroomDone ? BATHROOM_POINTS : 0)
  );
}

function requiredPoints(kid: Kid) {
  return BASE_POINTS + kid.carryoverPoints + kid.dishPenaltyPoints;
}

function stamp() {
  return new Date().toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isoNow() {
  return new Date().toISOString();
}

function defaultState(): AppState {
  const library = normalizeLibrary(DEFAULT_LIBRARY);
  return {
    library,
    parentPin: DEFAULT_PIN,
    dogCare: { amFedAt: null, pmFedAt: null, chiefMedsAt: null },
    groceryItems: [],
    groceryQuickAdds: DEFAULT_GROCERY_QUICK_ADDS,
    completionEvents: [],
    lastWeekKey: getWeekStart().toISOString(),
    kids: KID_NAMES.map((name, index) => ({
      id: index + 1,
      name,
      chores: makeChores(library),
      customChores: [],
      dishesLoadDone: false,
      dishesUnloadDone: false,
      bathroomAssigned: index === 0,
      bathroomDone: false,
      carryoverPoints: 0,
      dishPenaltyPoints: 0,
      weeksTracked: 0,
      weeksSuccessful: 0,
    })),
  };
}

function loadState(): AppState {
  const fallback = defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const library = normalizeLibrary(parsed.library);

    return {
      library,
      parentPin: parsed.parentPin ?? DEFAULT_PIN,
      dogCare: parsed.dogCare ?? fallback.dogCare,
      groceryItems: Array.isArray(parsed.groceryItems) ? parsed.groceryItems : [],
      groceryQuickAdds: Array.isArray(parsed.groceryQuickAdds) ? parsed.groceryQuickAdds : DEFAULT_GROCERY_QUICK_ADDS,
      completionEvents: Array.isArray(parsed.completionEvents) ? parsed.completionEvents : [],
      lastWeekKey: parsed.lastWeekKey ?? fallback.lastWeekKey,
      kids: fallback.kids.map((baseKid, index) => {
        const rawKid = parsed.kids?.find((kid: Kid) => kid.name === baseKid.name) ?? parsed.kids?.[index] ?? {};
        return {
          ...baseKid,
          ...rawKid,
          id: baseKid.id,
          name: baseKid.name,
          chores: library.map((def) => {
            const existing = rawKid.chores?.find((chore: Chore) => chore.id === def.id || chore.name === def.name);
            return { ...def, doneCount: Number(existing?.doneCount ?? 0) };
          }),
          customChores: Array.isArray(rawKid.customChores) ? rawKid.customChores : [],
          dishesLoadDone: Boolean(rawKid.dishesLoadDone),
          dishesUnloadDone: Boolean(rawKid.dishesUnloadDone),
          bathroomAssigned: Boolean(rawKid.bathroomAssigned ?? baseKid.bathroomAssigned),
          bathroomDone: Boolean(rawKid.bathroomDone),
          carryoverPoints: Number(rawKid.carryoverPoints ?? 0),
          dishPenaltyPoints: Number(rawKid.dishPenaltyPoints ?? 0),
          weeksTracked: Number(rawKid.weeksTracked ?? 0),
          weeksSuccessful: Number(rawKid.weeksSuccessful ?? 0),
        };
      }),
    };
  } catch {
    return fallback;
  }
}

export default function App() {
  const initial = useMemo(() => loadState(), []);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [library, setLibrary] = useState<ChoreDef[]>(initial.library);
  const [kids, setKids] = useState<Kid[]>(initial.kids);
  const [dogCare, setDogCare] = useState<DogCare>(initial.dogCare);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>(initial.groceryItems);
  const [groceryInput, setGroceryInput] = useState("");
  const [groceryQuickAdds, setGroceryQuickAdds] = useState<string[]>(initial.groceryQuickAdds);
  const [newQuickAdd, setNewQuickAdd] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [completionEvents, setCompletionEvents] = useState<CompletionEvent[]>(initial.completionEvents);
  const [parentPin, setParentPin] = useState(initial.parentPin);
  const [enteredPin, setEnteredPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("1M");
  const [overdueKidId, setOverdueKidId] = useState(1);
  const [overdueValue, setOverdueValue] = useState("0");
  const [libraryForm, setLibraryForm] = useState({
    name: "",
    points: "1",
    category: "General",
    unlimitedPerWeek: false,
    allowParentOverride: false,
  });
  const [clock, setClock] = useState(new Date());
  const [refreshTick, setRefreshTick] = useState(0);
  const [weatherText, setWeatherText] = useState("Loading weather...");
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState("");
  const [lastWeekKey, setLastWeekKey] = useState(initial.lastWeekKey);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshTick((previous) => previous + 1), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const response = await fetch("https://wttr.in/Overland%20Park,Kansas?format=j1");
        const data = await response.json();
        const current = data?.current_condition?.[0];

        if (!cancelled) {
          const desc = current?.weatherDesc?.[0]?.value ?? "Weather unavailable";
          const temp = current?.temp_F ?? "--";
          const feels = current?.FeelsLikeF ?? "--";
          const humidity = current?.humidity ?? "--";
          const wind = current?.windspeedMiles ?? "--";
          setWeatherText(`${desc} · ${temp}°F · Feels ${feels}°F · Humidity ${humidity}% · Wind ${wind} mph`);
          setWeatherUpdatedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        }
      } catch {
        if (!cancelled) setWeatherText("Weather unavailable. Check internet connection.");
      }
    }

    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    const state: AppState = {
      kids,
      library,
      dogCare,
      groceryItems,
      groceryQuickAdds,
      completionEvents,
      parentPin,
      lastWeekKey,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [kids, library, dogCare, groceryItems, groceryQuickAdds, completionEvents, parentPin, lastWeekKey]);

  const weekStart = getWeekStart(clock);
  const weekEnd = getWeekEnd(clock);
  const countdownText = formatCountdown(weekEnd.getTime() - clock.getTime());
  const todayKey = clock.toDateString();

  const dogStatus = {
    amDone: dogCare.amFedAt ? new Date(dogCare.amFedAt).toDateString() === todayKey : false,
    pmDone: dogCare.pmFedAt ? new Date(dogCare.pmFedAt).toDateString() === todayKey : false,
    medsDone: dogCare.chiefMedsAt ? new Date(dogCare.chiefMedsAt).toDateString() === todayKey : false,
  };

  const dogOverdue = {
    am: clock.getHours() >= 8 && !dogStatus.amDone,
    pm: clock.getHours() >= 21 && !dogStatus.pmDone,
    meds: clock.getHours() >= 8 && !dogStatus.medsDone,
  };

  useEffect(() => {
    const currentWeekKey = weekStart.toISOString();
    if (currentWeekKey === lastWeekKey) return;

    setKids((previousKids) => {
      const currentBathroomIndex = previousKids.findIndex((kid) => kid.bathroomAssigned);
      const nextBathroomIndex = currentBathroomIndex >= 0 ? (currentBathroomIndex + 1) % previousKids.length : 0;

      return previousKids.map((kid, index) => {
        const done = completedPoints(kid);
        const need = requiredPoints(kid);
        const carryover = Math.max(0, need - done);
        const penalty = kid.dishesLoadDone && kid.dishesUnloadDone ? 0 : DISH_PENALTY;
        const success = carryover === 0 && penalty === 0;

        return {
          ...kid,
          chores: makeChores(library),
          customChores: [],
          dishesLoadDone: false,
          dishesUnloadDone: false,
          bathroomAssigned: index === nextBathroomIndex,
          bathroomDone: false,
          carryoverPoints: carryover,
          dishPenaltyPoints: penalty,
          weeksTracked: kid.weeksTracked + 1,
          weeksSuccessful: kid.weeksSuccessful + (success ? 1 : 0),
        };
      });
    });

    setDogCare({ amFedAt: null, pmFedAt: null, chiefMedsAt: null });
    setLastWeekKey(currentWeekKey);
  }, [weekStart, lastWeekKey, library]);

  const kidsWithMetrics = useMemo(
    () =>
      kids.map((kid) => {
        const completed = completedPoints(kid);
        const required = requiredPoints(kid);
        const pointsRemaining = Math.max(0, required - completed);
        const storedOverdue = kid.carryoverPoints + kid.dishPenaltyPoints;
        const pointsAppliedPastBase = Math.max(0, completed - BASE_POINTS);
        const overduePoints = Math.max(0, storedOverdue - pointsAppliedPastBase);
        const progress = required === 0 ? 100 : Math.min(100, Math.round((completed / required) * 100));
        const completionRate = kid.weeksTracked > 0 ? Math.round((kid.weeksSuccessful / kid.weeksTracked) * 100) : 0;
        return { ...kid, completedPoints: completed, requiredPoints: required, pointsRemaining, overduePoints, storedOverdue, progress, completionRate };
      }),
    [kids]
  );

  const selectedKid = kidsWithMetrics.find((kid) => kid.id === selectedKidId) ?? null;

  const grocerySuggestions = useMemo(() => {
    const q = groceryInput.trim().toLowerCase();
    const alreadyListed = new Set(groceryItems.map((item) => item.name.toLowerCase()));
    const source = groceryQuickAdds.filter((item) => !alreadyListed.has(item.toLowerCase()));
    if (!q) return source.slice(0, 8);
    return source.filter((item) => item.toLowerCase().includes(q)).slice(0, 8);
  }, [groceryInput, groceryItems, groceryQuickAdds]);

  const filteredEvents = useMemo(() => {
    if (reportPeriod === "LIFETIME") return completionEvents;
    const days = reportPeriod === "1M" ? 31 : 93;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return completionEvents.filter((event) => new Date(event.at).getTime() >= cutoff);
  }, [completionEvents, reportPeriod]);

  function quoteForKid(kidId: number) {
    const slot = Math.floor(Date.now() / (15 * 60 * 1000));
    return QUOTES[(kidId - 1 + slot * KID_NAMES.length) % QUOTES.length] ?? "Do the next right thing.";
  }

  function updateKid(kidId: number, updater: (kid: Kid) => Kid) {
    setKids((previousKids) => previousKids.map((kid) => (kid.id === kidId ? updater(kid) : kid)));
  }

  function logCompletion(kid: Kid, chore: { id: number; name: string; points: number }, kind: CompletionEvent["kind"]) {
    setCompletionEvents((previous) => [
      ...previous,
      {
        id: Date.now() + Math.random(),
        kidId: kid.id,
        kidName: kid.name,
        choreId: chore.id,
        choreName: chore.name,
        points: chore.points,
        at: isoNow(),
        kind,
      },
    ]);
  }

  function removeLatestCompletion(kidId: number, choreId: number) {
    setCompletionEvents((previous) => {
      const reverseIndex = [...previous].reverse().findIndex((event) => event.kidId === kidId && event.choreId === choreId);
      if (reverseIndex < 0) return previous;
      const realIndex = previous.length - 1 - reverseIndex;
      return previous.filter((_, index) => index !== realIndex);
    });
  }

  function markChore(kidId: number, choreId: number) {
    updateKid(kidId, (kid) => {
      const chore = kid.chores.find((item) => item.id === choreId);
      if (!chore) return kid;

      if (chore.doneCount > 0) {
        removeLatestCompletion(kid.id, chore.id);
        return {
          ...kid,
          chores: sortByName(kid.chores.map((item) => (item.id === choreId ? { ...item, doneCount: Math.max(0, item.doneCount - 1) } : item))),
        };
      }

      logCompletion(kid, chore, "library");
      return {
        ...kid,
        chores: sortByName(kid.chores.map((item) => (item.id === choreId ? { ...item, doneCount: 1 } : item))),
      };
    });
  }

  function addExtraChore(kidId: number, choreId: number) {
    updateKid(kidId, (kid) => {
      const chore = kid.chores.find((item) => item.id === choreId);
      if (!chore) return kid;
      if (!chore.unlimitedPerWeek && !chore.allowParentOverride) return kid;

      if (chore.allowParentOverride && !chore.unlimitedPerWeek) {
        const pin = window.prompt(`Parent PIN required to add extra ${chore.name}:`, "");
        if (pin !== parentPin) return kid;
      }

      logCompletion(kid, chore, "library");
      return {
        ...kid,
        chores: sortByName(kid.chores.map((item) => (item.id === choreId ? { ...item, doneCount: item.doneCount + 1 } : item))),
      };
    });
  }

  function toggleCustomChore(kidId: number, choreId: number) {
    updateKid(kidId, (kid) => {
      const chore = kid.customChores.find((item) => item.id === choreId);
      if (!chore) return kid;
      const nextCount = chore.doneCount > 0 ? 0 : 1;
      if (nextCount) logCompletion(kid, chore, "custom");
      else removeLatestCompletion(kid.id, chore.id);

      return {
        ...kid,
        customChores: sortByName(kid.customChores.map((item) => (item.id === choreId ? { ...item, doneCount: nextCount } : item))),
      };
    });
  }

  function toggleDishField(kidId: number, field: "dishesLoadDone" | "dishesUnloadDone" | "bathroomDone") {
    updateKid(kidId, (kid) => {
      const nextValue = !kid[field];
      const choreId = field === "dishesLoadDone" ? -101 : field === "dishesUnloadDone" ? -102 : -103;
      const choreName = field === "dishesLoadDone" ? "load dishes" : field === "dishesUnloadDone" ? "unload dishes" : "kids bathroom";
      const points = field === "bathroomDone" ? BATHROOM_POINTS : 0;

      if (nextValue) logCompletion(kid, { id: choreId, name: choreName, points }, field === "bathroomDone" ? "bathroom" : "dishes");
      else removeLatestCompletion(kid.id, choreId);

      return { ...kid, [field]: nextValue };
    });
  }

  function addGroceryItem() {
    const name = groceryInput.trim();
    if (!name) return;
    setGroceryItems((previous) => [...previous, { id: Date.now(), name, addedAt: stamp() }]);
    setGroceryInput("");
    setSelectedSuggestion(0);
  }

  function selectGrocerySuggestion(item: string) {
    setGroceryInput(item);
    setSelectedSuggestion(0);
  }

  function deleteGroceryItem(id: number) {
    setGroceryItems((previous) => previous.filter((item) => item.id !== id));
  }

  function addQuickGrocerySuggestion() {
    const value = newQuickAdd.trim();
    if (!value) return;
    setGroceryQuickAdds((previous) => {
      if (previous.some((item) => item.toLowerCase() === value.toLowerCase())) return previous;
      return [...previous, value].sort((a, b) => a.localeCompare(b));
    });
    setNewQuickAdd("");
  }

  function updateQuickGrocerySuggestion(index: number, value: string) {
    setGroceryQuickAdds((previous) => previous.map((item, i) => (i === index ? value : item)));
  }

  function deleteQuickGrocerySuggestion(index: number) {
    setGroceryQuickAdds((previous) => previous.filter((_, i) => i !== index));
  }

  function addLibraryChore() {
    if (!libraryForm.name.trim()) return;

    const newChore: ChoreDef = {
      id: Date.now(),
      name: libraryForm.name.trim(),
      points: Math.max(0, Number(libraryForm.points) || 0),
      category: libraryForm.category || "General",
      unlimitedPerWeek: libraryForm.unlimitedPerWeek,
      allowParentOverride: libraryForm.allowParentOverride,
    };

    setLibrary((previous) => sortByName([...previous, newChore]));
    setKids((previous) =>
      previous.map((kid) => ({
        ...kid,
        chores: sortByName([...kid.chores, { ...newChore, doneCount: 0 }]),
      }))
    );

    setLibraryForm({ name: "", points: "1", category: "General", unlimitedPerWeek: false, allowParentOverride: false });
  }

  function updateLibraryChore(id: number, field: keyof ChoreDef, value: string | boolean) {
    const parsedValue = field === "points" ? Math.max(0, Number(value) || 0) : value;

    setLibrary((previous) => sortByName(previous.map((chore) => (chore.id === id ? { ...chore, [field]: parsedValue } : chore))));
    setKids((previous) =>
      previous.map((kid) => ({
        ...kid,
        chores: sortByName(kid.chores.map((chore) => (chore.id === id ? { ...chore, [field]: parsedValue } : chore))),
      }))
    );
  }

  function deleteLibraryChore(id: number) {
    const target = library.find((chore) => chore.id === id);
    if (!target) return;
    if (!window.confirm(`Delete ${target.name}?`)) return;
    setLibrary((previous) => previous.filter((chore) => chore.id !== id));
    setKids((previous) =>
      previous.map((kid) => ({
        ...kid,
        chores: kid.chores.filter((chore) => chore.id !== id),
      }))
    );
  }

  function addCustomChore(kidId: number) {
    const pin = window.prompt("Enter parent PIN:", "");
    if (pin !== parentPin) return;
    const name = window.prompt("Custom chore:", "");
    if (!name?.trim()) return;
    const points = Math.max(0, Number(window.prompt("Points:", "1")) || 0);
    const chore: Chore = {
      id: Date.now(),
      name: name.trim(),
      points,
      category: "Custom",
      unlimitedPerWeek: false,
      allowParentOverride: false,
      doneCount: 0,
    };
    updateKid(kidId, (kid) => ({ ...kid, customChores: sortByName([...kid.customChores, chore]) }));
  }

  function setBathroomAssignedKid(kidId: number) {
    setKids((previousKids) =>
      previousKids.map((kid) => ({
        ...kid,
        bathroomAssigned: kid.id === kidId,
        bathroomDone: kid.id === kidId ? kid.bathroomDone : false,
      }))
    );
  }

  function setKidOverduePoints() {
    const nextOverdue = Math.max(0, Number(overdueValue) || 0);
    updateKid(overdueKidId, (kid) => ({
      ...kid,
      carryoverPoints: nextOverdue,
      dishPenaltyPoints: 0,
    }));
  }

  function exportBackup() {
    const state: AppState = { kids, library, dogCare, groceryItems, groceryQuickAdds, completionEvents, parentPin, lastWeekKey };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hadtieri-house-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>;
      setKids(parsed.kids ?? kids);
      setLibrary(parsed.library ?? library);
      setDogCare(parsed.dogCare ?? dogCare);
      setGroceryItems(parsed.groceryItems ?? []);
      setGroceryQuickAdds(parsed.groceryQuickAdds ?? DEFAULT_GROCERY_QUICK_ADDS);
      setCompletionEvents(parsed.completionEvents ?? []);
      setParentPin(parsed.parentPin ?? DEFAULT_PIN);
      setLastWeekKey(parsed.lastWeekKey ?? getWeekStart().toISOString());
      setMessage("Backup imported.");
    } catch {
      setMessage("Could not import backup.");
    }
  }

  function Header() {
    return (
      <div className="header-grid">
        <div className="card header-card">
          <div className="muted">Week of</div>
          <div className="headline">{weekStart.toLocaleDateString()}</div>
        </div>
        <div className="card header-card">
          <div className="muted">Current Time</div>
          <div className="header-value">{clock.toLocaleDateString()} · {clock.toLocaleTimeString()}</div>
        </div>
        <div className="card header-card">
          <div className="muted">Sunday 11:59 PM</div>
          <div className="header-value">{countdownText}</div>
        </div>
      </div>
    );
  }

  function DogAction(props: { title: string; status: string; onClick: () => void; button: string }) {
    return (
      <div className="mini-card">
        <div className="mini-title">{props.title}</div>
        <div className="mini-status">{props.status}</div>
        <button className="button full" onClick={props.onClick}>{props.button}</button>
      </div>
    );
  }

  function DogCard() {
    return (
      <div className={`card ${dogOverdue.am || dogOverdue.pm || dogOverdue.meds ? "danger-card" : ""}`}>
        <div className="section-title">Dog Care</div>
        <div className="dog-grid">
          <DogAction
            title="AM Feed by 8:00 AM"
            status={dogStatus.amDone ? "Done" : dogOverdue.am ? "OVERDUE" : "Pending"}
            onClick={() => setDogCare((previous) => ({ ...previous, amFedAt: previous.amFedAt ? null : isoNow() }))}
            button="Mark AM Feed"
          />
          <DogAction
            title="PM Feed by 9:00 PM"
            status={dogStatus.pmDone ? "Done" : dogOverdue.pm ? "OVERDUE" : "Pending"}
            onClick={() => setDogCare((previous) => ({ ...previous, pmFedAt: previous.pmFedAt ? null : isoNow() }))}
            button="Mark PM Feed"
          />
          <DogAction
            title="Chief Allergy Meds AM"
            status={dogStatus.medsDone ? "Done" : dogOverdue.meds ? "OVERDUE" : "Pending"}
            onClick={() => setDogCare((previous) => ({ ...previous, chiefMedsAt: previous.chiefMedsAt ? null : isoNow() }))}
            button="Mark Chief Meds"
          />
        </div>
      </div>
    );
  }

  function GroceryPanel() {
    return (
      <div className="card grocery-card">
        <div className="section-title">Grocery List</div>
        <div className="grocery-form">
          <input
            className="input"
            value={groceryInput}
            onChange={(event) => {
              setGroceryInput(event.target.value);
              setSelectedSuggestion(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedSuggestion((previous) => Math.min(previous + 1, Math.max(0, grocerySuggestions.length - 1)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedSuggestion((previous) => Math.max(previous - 1, 0));
              } else if (event.key === "Tab" && grocerySuggestions.length) {
                event.preventDefault();
                selectGrocerySuggestion(grocerySuggestions[selectedSuggestion] ?? grocerySuggestions[0]);
              } else if (event.key === "Enter") {
                event.preventDefault();
                addGroceryItem();
              }
            }}
            placeholder="Add grocery item..."
          />
          <button className="button" onClick={addGroceryItem}>Add</button>
        </div>

        <div className="suggestions">
          {grocerySuggestions.map((item, index) => (
            <button
              key={item}
              className={`suggestion ${index === selectedSuggestion ? "active" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectGrocerySuggestion(item);
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grocery-list">
          {groceryItems.length === 0 && <div className="muted">No grocery items yet.</div>}
          {groceryItems.map((item) => (
            <div className="grocery-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <div className="muted tiny">{item.addedAt}</div>
              </div>
              <button className="button danger small" onClick={() => deleteGroceryItem(item.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    );
  }


  function SummaryPanel() {
    const loadsDone = completionEvents.filter((event) => event.choreName === "load dishes").length;
    const totalMarked = kids.reduce(
      (sum, kid) => sum + kid.chores.reduce((s, chore) => s + chore.doneCount, 0) + kid.customChores.reduce((s, chore) => s + chore.doneCount, 0),
      0
    );

    return (
      <div className="sidebar-summary">
        <div className="card sidebar-stat">
          <div className="muted">Total chores marked</div>
          <div className="big-number">{totalMarked}</div>
        </div>
        <div className="card sidebar-stat">
          <div className="muted">Loads of dishes done</div>
          <div className="big-number">{loadsDone}</div>
        </div>
      </div>
    );
  }

  function Metric(props: { label: string; value: number; danger?: boolean }) {
    return (
      <div className={`metric ${props.danger ? "metric-danger" : ""}`}>
        <div>{props.label}</div>
        <strong>{props.value}</strong>
      </div>
    );
  }

  function KidTile({ kid }: { kid: (typeof kidsWithMetrics)[number] }) {
    return (
      <div className={`kid-tile ${kid.overduePoints > 0 ? "tile-overdue" : kid.pointsRemaining === 0 ? "tile-complete" : ""}`}>
        <div className="kid-top">
          <div>
            <div className="kid-name">{kid.name}</div>
            <div className="quote">{quoteForKid(kid.id)}</div>
          </div>
          <span className="pill">Working</span>
        </div>

        <div>
          <div className="row">
            <span>Progress</span>
            <strong>{kid.progress}%</strong>
          </div>
          <div className="progress">
            <div style={{ width: `${kid.progress}%` }} />
          </div>
        </div>

        <div className="tile-metrics">
          <Metric label="Remaining" value={kid.pointsRemaining} />
          <Metric label="Completed" value={kid.completedPoints} />
          <Metric label="Overdue Left" value={kid.overduePoints} danger={kid.overduePoints > 0} />
        </div>

        <div className="tile-actions">
          <button className={`button ${kid.dishesLoadDone ? "success" : "danger"}`} onClick={() => toggleDishField(kid.id, "dishesLoadDone")}>
            Load Dishes {kid.dishesLoadDone ? "✓" : "✕"}
          </button>
          <button className={`button ${kid.dishesUnloadDone ? "success" : "danger"}`} onClick={() => toggleDishField(kid.id, "dishesUnloadDone")}>
            Unload Dishes {kid.dishesUnloadDone ? "✓" : "✕"}
          </button>
          <button className={`button ${!kid.bathroomAssigned ? "disabled" : kid.bathroomDone ? "success" : "danger"}`} onClick={() => kid.bathroomAssigned && toggleDishField(kid.id, "bathroomDone")}>
            {kid.bathroomAssigned ? `Bathroom ${kid.bathroomDone ? "✓" : "✕"}` : "Bathroom N/A"}
          </button>
        </div>

        <button className="button secondary track" onClick={() => { setSelectedKidId(kid.id); setScreen("kid"); }}>
          Track {kid.name}
        </button>
      </div>
    );
  }

  function WeatherCard() {
    return (
      <div className="card weather">
        <div className="section-title">Weather · Overland Park / 66213</div>
        <div className="weather-main">{weatherText}</div>
        <div className="muted tiny">Updates with quotes every 15 minutes{weatherUpdatedAt ? ` · Last update ${weatherUpdatedAt}` : ""}</div>
      </div>
    );
  }

  function HomeScreen() {
    return (
      <div className="page">
        <div className="shell">
          {Header()}

          <div className="title-row">
            <div>
              <div className="app-title">🏠 Hadtieri House</div>
              <div className="app-version">{VERSION}</div>
            </div>
            <button className="button" onClick={() => setScreen("parent")}>Parent Console</button>
          </div>

          <div className="dashboard">
            <div className="left-column">
              {SummaryPanel()}
              {GroceryPanel()}
            </div>

            <div className="main-area">
              {DogCard()}
              <div className="kids-grid">
                {kidsWithMetrics.map((kid) => <KidTile kid={kid} key={kid.id} />)}
              </div>
              {WeatherCard()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function KidScreen({ kid }: { kid: (typeof kidsWithMetrics)[number] }) {
    return (
      <div className="page scroll-page">
        <div className="shell parent-shell">
          {Header()}

          <div className="title-row">
            <div className="title-left">
              <button className="button secondary" onClick={() => setScreen("home")}>← Home</button>
              <button className="button secondary" onClick={() => setScreen("parent")}>Parent Console</button>
              <div>
                <div className="app-title">{kid.name}</div>
                <div className="app-version">Kid Console</div>
              </div>
            </div>
            <button className="button secondary" onClick={() => addCustomChore(kid.id)}>+ Custom Chore</button>
          </div>

          <div className="kid-summary">
            <Metric label="Required" value={kid.requiredPoints} />
            <Metric label="Completed" value={kid.completedPoints} />
            <Metric label="Remaining" value={kid.pointsRemaining} />
            <Metric label="Overdue Left" value={kid.overduePoints} danger={kid.overduePoints > 0} />
          </div>

          <div className="card">
            <div className="section-title">Weekly Checklist</div>
            <div className="chore-grid">
              {kid.chores.map((chore) => (
                <div className={`chore-tile ${chore.doneCount ? "chore-done" : ""}`} key={chore.id}>
                  <div className="chore-name">{chore.name}</div>
                  <div className="muted">{chore.category} · {chore.points} pt · {chore.doneCount}x</div>
                  <button className={`button full ${chore.doneCount ? "secondary" : "success"}`} onClick={() => markChore(kid.id, chore.id)}>
                    {chore.doneCount ? "Undo One" : "Mark Done"}
                  </button>
                  {chore.doneCount > 0 && (chore.unlimitedPerWeek || chore.allowParentOverride) && (
                    <button className="button full" onClick={() => addExtraChore(kid.id, chore.id)}>+ Extra</button>
                  )}
                </div>
              ))}
              {kid.customChores.map((chore) => (
                <button className={`chore-tile ${chore.doneCount ? "chore-done" : ""}`} key={chore.id} onClick={() => toggleCustomChore(kid.id, chore.id)}>
                  <div className="chore-name">{chore.name}</div>
                  <div className="muted">Custom · {chore.points} pt · {chore.doneCount}x</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Focus stability note: screen functions are invoked directly at the bottom of App, not rendered as <ParentScreen />.
  // This prevents remounting inputs on every parent state update.
  function ParentScreen() {
    return (
      <div className="page scroll-page">
        <div className="shell parent-shell">
          {Header()}

          <div className="title-row">
            <div>
              <div className="app-title">🔒 Parent Console</div>
              <div className="app-version">{VERSION}</div>
            </div>
            <button className="button secondary" onClick={() => setScreen("home")}>Home</button>
          </div>

          {!parentUnlocked ? (
            <div className="card pin-card">
              <div className="section-title">Enter Parent PIN</div>
              <div className="form-row">
                <input className="input" type="password" value={enteredPin} onChange={(event) => setEnteredPin(event.target.value)} placeholder="Default PIN: 5422" />
                <button
                  className="button"
                  onClick={() => {
                    if (enteredPin === parentPin) {
                      setParentUnlocked(true);
                      setEnteredPin("");
                      setMessage("");
                    } else {
                      setMessage("Incorrect PIN");
                    }
                  }}
                >
                  Unlock
                </button>
              </div>
              {message && <div className="message">{message}</div>}
            </div>
          ) : (
            <div className="parent-content">
              <div className="parent-grid">
                <div className="card">
                  <div className="section-title">PIN & Backup</div>
                  <div className="form-row wrap">
                    <input className="input" type="password" value={newPin} onChange={(event) => setNewPin(event.target.value)} placeholder="New PIN" />
                    <button
                      className="button"
                      onClick={() => {
                        if (/^\d{4}$/.test(newPin)) {
                          setParentPin(newPin);
                          setNewPin("");
                          setMessage("PIN updated.");
                        } else {
                          setMessage("PIN must be 4 digits.");
                        }
                      }}
                    >
                      Update PIN
                    </button>
                    <button className="button" onClick={() => setScreen("reports")}>Open Reports</button>
                    <button className="button secondary" onClick={exportBackup}>Export Backup</button>
                    <input type="file" accept="application/json" onChange={importBackup} />
                  </div>
                  {message && <div className="message">{message}</div>}
                </div>

                <div className="card">
                  <div className="section-title">Manual Overdue Points</div>
                  <div className="form-row wrap">
                    <select className="input" value={overdueKidId} onChange={(event) => setOverdueKidId(Number(event.target.value))}>
                      {kidsWithMetrics.map((kid) => <option key={kid.id} value={kid.id}>{kid.name}</option>)}
                    </select>
                    <input className="input" value={overdueValue} onChange={(event) => setOverdueValue(event.target.value)} />
                    <button className="button" onClick={setKidOverduePoints}>Set Overdue</button>
                  </div>
                </div>

                <div className="card">
                  <div className="section-title">Bathroom Rotation Override</div>
                  <div className="form-row wrap">
                    <select
                      className="input"
                      value={kids.find((kid) => kid.bathroomAssigned)?.id ?? 1}
                      onChange={(event) => setBathroomAssignedKid(Number(event.target.value))}
                    >
                      {kids.map((kid) => (
                        <option key={kid.id} value={kid.id}>{kid.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    This only changes who has bathroom this week. The weekly order stays the same, so the next kid in line gets it next week.
                  </div>
                </div>

                <div className="card">
                  <div className="section-title">Add Library Chore</div>
                  <div className="form-column">
                    <input className="input" value={libraryForm.name} onChange={(event) => setLibraryForm({ ...libraryForm, name: event.target.value })} placeholder="Chore name" />
                    <input className="input" value={libraryForm.points} onChange={(event) => setLibraryForm({ ...libraryForm, points: event.target.value })} placeholder="Points" />
                    <input className="input" value={libraryForm.category} onChange={(event) => setLibraryForm({ ...libraryForm, category: event.target.value })} placeholder="Category" />
                    <label><input type="checkbox" checked={libraryForm.unlimitedPerWeek} onChange={(event) => setLibraryForm({ ...libraryForm, unlimitedPerWeek: event.target.checked })} /> Unlimited</label>
                    <label><input type="checkbox" checked={libraryForm.allowParentOverride} onChange={(event) => setLibraryForm({ ...libraryForm, allowParentOverride: event.target.checked })} /> Parent override</label>
                    <button className="button" onClick={addLibraryChore}>Add Chore</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="section-title">Grocery Quick Add Editor</div>
                <div className="form-row wrap">
                  <input className="input" value={newQuickAdd} onChange={(event) => setNewQuickAdd(event.target.value)} placeholder="Add quick suggestion" />
                  <button className="button" onClick={addQuickGrocerySuggestion}>Add</button>
                  <button className="button secondary" onClick={() => setGroceryQuickAdds(DEFAULT_GROCERY_QUICK_ADDS)}>Reset</button>
                </div>
                <div className="library-list">
                  {groceryQuickAdds.map((item, index) => (
                    <div className="library-row simple" key={`${item}-${index}`}>
                      <input className="input" value={item} onChange={(event) => updateQuickGrocerySuggestion(index, event.target.value)} />
                      <button className="button danger" onClick={() => deleteQuickGrocerySuggestion(index)}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-title">Library Chores</div>
                <div className="library-list">
                  {library.map((chore) => (
                    <div className="library-row" key={chore.id}>
                      <input className="input" value={chore.name} onChange={(event) => updateLibraryChore(chore.id, "name", event.target.value)} />
                      <input className="input small-input" value={chore.points} onChange={(event) => updateLibraryChore(chore.id, "points", event.target.value)} />
                      <input className="input" value={chore.category} onChange={(event) => updateLibraryChore(chore.id, "category", event.target.value)} />
                      <label><input type="checkbox" checked={chore.unlimitedPerWeek} onChange={(event) => updateLibraryChore(chore.id, "unlimitedPerWeek", event.target.checked)} /> Unlimited</label>
                      <label><input type="checkbox" checked={chore.allowParentOverride} onChange={(event) => updateLibraryChore(chore.id, "allowParentOverride", event.target.checked)} /> Override</label>
                      <button className="button danger" onClick={() => deleteLibraryChore(chore.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-title">Completion Summary</div>
                <div className="parent-list">
                  {kidsWithMetrics.map((kid) => (
                    <div className="parent-row" key={kid.id}>
                      <div className="row"><strong>{kid.name}</strong><span>{kid.completionRate}% success</span></div>
                      <div>Required: {kid.requiredPoints}</div>
                      <div>Completed: {kid.completedPoints}</div>
                      <div>Remaining: {kid.pointsRemaining}</div>
                      <div>Overdue left: {kid.overduePoints}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function ReportsScreen() {
    const choreNames = [...new Set(filteredEvents.map((event) => event.choreName))].sort();

    return (
      <div className="page scroll-page">
        <div className="shell parent-shell">
          {Header()}

          <div className="title-row">
            <div>
              <div className="app-title">📊 Reports</div>
              <div className="app-version">Parent reporting</div>
            </div>
            <div className="form-row">
              <button className="button secondary" onClick={() => setScreen("parent")}>Parent Console</button>
              <button className="button secondary" onClick={() => setScreen("home")}>Home</button>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Detailed Chore Reporting</div>
            <div className="form-row wrap">
              {(["1M", "3M", "LIFETIME"] as ReportPeriod[]).map((period) => (
                <button key={period} className={`button ${reportPeriod === period ? "" : "secondary"}`} onClick={() => setReportPeriod(period)}>
                  {period === "LIFETIME" ? "Lifetime" : period}
                </button>
              ))}
            </div>

            <div className="report-grid">
              <div className="mini-card">
                <h3>By Kid: Most Completed Chores</h3>
                {kidsWithMetrics.map((kid) => {
                  const events = filteredEvents.filter((event) => event.kidId === kid.id);
                  const total = events.length || 0;
                  const counts = new Map<string, number>();
                  events.forEach((event) => counts.set(event.choreName, (counts.get(event.choreName) ?? 0) + 1));
                  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

                  return (
                    <div className="report-item" key={kid.id}>
                      <strong>{kid.name}</strong>
                      {rows.length === 0 ? <div className="muted">No data yet</div> : rows.map(([name, count]) => <div key={name}>{name}: {total ? Math.round((count / total) * 100) : 0}% ({count})</div>)}
                    </div>
                  );
                })}
              </div>

              <div className="mini-card">
                <h3>By Chore: Kid Share</h3>
                {choreNames.length === 0 && <div className="muted">No data yet</div>}
                {choreNames.map((name) => {
                  const events = filteredEvents.filter((event) => event.choreName === name);
                  return (
                    <div className="report-item" key={name}>
                      <strong>{name}</strong>
                      {KID_NAMES.map((kidName) => {
                        const count = events.filter((event) => event.kidName === kidName).length;
                        return count ? <div key={kidName}>{kidName}: {Math.round((count / events.length) * 100)}% ({count})</div> : null;
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="mini-card">
                <h3>Point Completion Rate</h3>
                {kidsWithMetrics.map((kid) => (
                  <div className="report-item" key={kid.id}>
                    <div className="row"><strong>{kid.name}</strong><span>{kid.completionRate}%</span></div>
                    <div className="muted">Weeks tracked: {kid.weeksTracked}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "kid" && selectedKid) return KidScreen({ kid: selectedKid });
  if (screen === "parent") return ParentScreen();
  if (screen === "reports") return ReportsScreen();
  return HomeScreen();
}
