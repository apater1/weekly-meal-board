const scheduleRoot = document.querySelector('#scheduleRoot');
const todayRoot = document.querySelector('#todayRoot');
const todayLabel = document.querySelector('#todayLabel');
const suggestionList = document.querySelector('#suggestionList');
const mealForm = document.querySelector('#mealForm');
const suggestionForm = document.querySelector('#suggestionForm');
const refreshSchedule = document.querySelector('#refreshSchedule');
const cancelEdit = document.querySelector('#cancelEdit');
const liveStatus = document.querySelector('#liveStatus');
const scheduleWindow = document.querySelector('#scheduleWindow');
const scheduleCount = document.querySelector('#scheduleCount');
const editorTitle = document.querySelector('#editorTitle');
const mealEntryId = document.querySelector('#mealEntryId');
const mealDateInput = document.querySelector('#mealDate');
const breakfastInput = document.querySelector('#breakfast');
const lunchInput = document.querySelector('#lunch');
const dinnerInput = document.querySelector('#dinner');
const suggestionAuthorInput = document.querySelector('#suggestionAuthor');
const suggestionTypeSelect = document.querySelector('#suggestionType');
const suggestionEntrySelect = document.querySelector('#suggestionEntryId');
const suggestionSlotSelect = document.querySelector('#suggestionSlot');
const suggestionTitleInput = document.querySelector('#suggestionTitle');
const suggestionDetailsInput = document.querySelector('#suggestionDetails');

const dayTemplate = document.querySelector('#dayTemplate');
const mealRowTemplate = document.querySelector('#mealRowTemplate');
const suggestionTemplate = document.querySelector('#suggestionTemplate');

const slotLabels = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

let days = [];
let suggestions = [];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

function setStatus(text) {
  liveStatus.textContent = text;
}

function formatDate(value, formatter = dateFormatter) {
  return formatter.format(new Date(`${value}T00:00:00Z`));
}

function getLocalDateKey(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getMealText(day, slot) {
  return day[slot] || 'No meal entered yet.';
}

function groupByWeek(entries) {
  const weeks = new Map();

  for (const entry of entries) {
    if (!weeks.has(entry.week_number)) weeks.set(entry.week_number, []);
    weeks.get(entry.week_number).push(entry);
  }

  return [...weeks.entries()].sort((left, right) => left[0] - right[0]);
}

function renderSuggestionDayOptions() {
  suggestionEntrySelect.innerHTML = '';

  for (const day of days) {
    const option = document.createElement('option');
    option.value = day.id;
    option.textContent = `Week ${day.week_number} • ${day.day_name}, ${formatDate(day.meal_date)} • ${day.meal_date}`;
    suggestionEntrySelect.append(option);
  }
}

function renderScheduleSummary() {
  if (!days.length) {
    scheduleWindow.textContent = 'No dates loaded';
    scheduleCount.textContent = '0 day entries';
    return;
  }

  const first = days[0];
  const last = days[days.length - 1];
  scheduleWindow.textContent = `${formatDate(first.meal_date, longDateFormatter)} to ${formatDate(last.meal_date, longDateFormatter)}`;
  scheduleCount.textContent = `${days.length} day entries`;
}

function renderFeaturedToday(entries) {
  todayRoot.innerHTML = '';

  const todayKey = getLocalDateKey();
  const featuredDay = entries.find((day) => day.meal_date === todayKey);

  if (!featuredDay) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No meal is scheduled for today.';
    todayLabel.textContent = 'Nothing scheduled for today';
    todayRoot.append(empty);
    return null;
  }

  todayLabel.textContent = `${featuredDay.day_name}, ${formatDate(featuredDay.meal_date, longDateFormatter)}`;

  const fragment = dayTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.day-card');
  const mealList = fragment.querySelector('.meal-list');

  card.classList.add('featured-day');
  fragment.querySelector('.day-meta').textContent = 'Today';
  fragment.querySelector('.day-title').textContent = `${featuredDay.day_name}, ${formatDate(featuredDay.meal_date)}`;
  fragment.querySelector('.edit-day-button').textContent = 'Edit today';
  fragment.querySelector('.edit-day-button').addEventListener('click', () => fillMealForm(featuredDay));

  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const rowFragment = mealRowTemplate.content.cloneNode(true);
    rowFragment.querySelector('.meal-label').textContent = slotLabels[slot];
    rowFragment.querySelector('.meal-text').textContent = getMealText(featuredDay, slot);
    rowFragment.querySelector('.suggest-meal-button').addEventListener('click', () => prefillSuggestion(featuredDay, slot));
    mealList.append(rowFragment);
  }

  todayRoot.append(fragment);
  return featuredDay;
}

function resetMealForm() {
  mealEntryId.value = '';
  mealDateInput.value = '';
  breakfastInput.value = '';
  lunchInput.value = '';
  dinnerInput.value = '';
  editorTitle.textContent = 'Edit a day';
}

function fillMealForm(day) {
  mealEntryId.value = day.id;
  mealDateInput.value = day.meal_date;
  breakfastInput.value = day.breakfast;
  lunchInput.value = day.lunch;
  dinnerInput.value = day.dinner;
  editorTitle.textContent = `${day.day_name}, ${formatDate(day.meal_date, longDateFormatter)}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prefillSuggestion(day, slot) {
  suggestionEntrySelect.value = String(day.id);
  suggestionSlotSelect.value = slot;
  suggestionTypeSelect.value = 'update';
  suggestionTitleInput.value = getMealText(day, slot);
  suggestionTitleInput.placeholder = 'Proposed replacement meal';
  suggestionDetailsInput.value = '';
  suggestionTitleInput.focus();
}

function renderSchedule(entries, featuredDayId = null) {
  scheduleRoot.innerHTML = '';

  const displayEntries = featuredDayId ? entries.filter((entry) => entry.id !== featuredDayId) : entries;

  if (!displayEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No schedule entries were found.';
    scheduleRoot.append(empty);
    return;
  }

  for (const [weekNumber, weekEntries] of groupByWeek(displayEntries)) {
    const weekSection = document.createElement('section');
    weekSection.className = 'week-section';

    const weekHeader = document.createElement('div');
    weekHeader.className = 'week-header';

    const titleWrap = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = `Week ${weekNumber}`;
    const summary = document.createElement('span');
    summary.className = 'suggestion-meta';
    summary.textContent = `${weekEntries.length} day entries`;
    titleWrap.append(heading, summary);

    const range = document.createElement('span');
    range.className = 'week-range';
    range.textContent = `${formatDate(weekEntries[0].meal_date)} - ${formatDate(weekEntries[weekEntries.length - 1].meal_date)}`;

    weekHeader.append(titleWrap, range);

    const grid = document.createElement('div');
    grid.className = 'day-grid';

    for (const day of weekEntries) {
      const fragment = dayTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.day-card');
      const mealList = fragment.querySelector('.meal-list');

      fragment.querySelector('.day-meta').textContent = `Day ${day.day_number}`;
      fragment.querySelector('.day-title').textContent = `${day.day_name}, ${formatDate(day.meal_date)}`;

      fragment.querySelector('.edit-day-button').addEventListener('click', () => fillMealForm(day));

      for (const slot of ['breakfast', 'lunch', 'dinner']) {
        const rowFragment = mealRowTemplate.content.cloneNode(true);
        rowFragment.querySelector('.meal-label').textContent = slotLabels[slot];
        rowFragment.querySelector('.meal-text').textContent = getMealText(day, slot);
        rowFragment.querySelector('.suggest-meal-button').addEventListener('click', () => prefillSuggestion(day, slot));
        mealList.append(rowFragment);
      }

      card.dataset.dayId = day.id;
      grid.append(fragment);
    }

    weekSection.append(weekHeader, grid);
    scheduleRoot.append(weekSection);
  }
}

function renderSuggestions(entries) {
  suggestionList.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No suggestions yet. The next idea can start here.';
    suggestionList.append(empty);
    return;
  }

  for (const suggestion of entries) {
    const fragment = suggestionTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.suggestion-card');
    const actionable = suggestion.status === 'pending';

    card.dataset.status = suggestion.status;
    fragment.querySelector('.suggestion-meta').textContent =
      `Week ${suggestion.week_number} • ${suggestion.day_name}, ${formatDate(suggestion.meal_date)} • ${slotLabels[suggestion.meal_slot]}`;
    fragment.querySelector('.suggestion-title').textContent = suggestion.title;
    fragment.querySelector('.suggestion-details').textContent = suggestion.details || 'No details provided.';
    fragment.querySelector('.suggestion-author').textContent = `By ${suggestion.author}`;
    fragment.querySelector('.status-pill').textContent = suggestion.status;

    const applyButton = fragment.querySelector('.accept-button');
    const rejectButton = fragment.querySelector('.reject-button');

    applyButton.disabled = !actionable;
    rejectButton.disabled = !actionable;

    if (suggestion.status !== 'pending') {
      applyButton.textContent = suggestion.status === 'accepted' ? 'Applied' : 'Applied';
      rejectButton.textContent = suggestion.status === 'rejected' ? 'Rejected' : 'Reviewed';
    }

    applyButton.addEventListener('click', async () => {
      await requestJson(`/api/suggestions/${suggestion.id}/apply`, { method: 'POST' });
      await loadData();
    });

    rejectButton.addEventListener('click', async () => {
      await requestJson(`/api/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      });
      await loadData();
    });

    suggestionList.append(fragment);
  }
}

function updateSuggestionPlaceholder() {
  const value = suggestionTypeSelect.value;
  suggestionTitleInput.placeholder =
    value === 'remove' ? 'What should be removed?' : 'Proposed replacement meal';
}

async function loadData() {
  setStatus('Refreshing...');
  const [scheduleData, suggestionData] = await Promise.all([
    requestJson('/api/schedule'),
    requestJson('/api/suggestions'),
  ]);

  days = scheduleData.days;
  suggestions = suggestionData.suggestions;

  renderScheduleSummary();
  renderSuggestionDayOptions();
  const featuredDay = renderFeaturedToday(days);
  renderSchedule(days, featuredDay?.id ?? null);
  renderSuggestions(suggestions);
  setStatus('Live and synced');
}

mealForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!mealEntryId.value) {
    setStatus('Choose a day card first');
    return;
  }

  await requestJson(`/api/schedule/${mealEntryId.value}`, {
    method: 'PUT',
    body: JSON.stringify({
      meal_date: mealDateInput.value,
      breakfast: breakfastInput.value.trim(),
      lunch: lunchInput.value.trim(),
      dinner: dinnerInput.value.trim(),
    }),
  });

  resetMealForm();
  await loadData();
});

suggestionTypeSelect.addEventListener('change', updateSuggestionPlaceholder);

suggestionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  await requestJson('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({
      author: suggestionAuthorInput.value.trim(),
      type: suggestionTypeSelect.value,
      meal_entry_id: suggestionEntrySelect.value,
      meal_slot: suggestionSlotSelect.value,
      title: suggestionTitleInput.value.trim(),
      details: suggestionDetailsInput.value.trim(),
    }),
  });

  suggestionForm.reset();
  suggestionTypeSelect.value = 'update';
  updateSuggestionPlaceholder();
  suggestionAuthorInput.value = '';
  await loadData();
});

refreshSchedule.addEventListener('click', loadData);
cancelEdit.addEventListener('click', resetMealForm);

resetMealForm();
updateSuggestionPlaceholder();

loadData().catch((error) => {
  console.error(error);
  setStatus('Unable to load schedule');
  scheduleRoot.innerHTML = '<div class="empty-state">Could not load the meal schedule.</div>';
  suggestionList.innerHTML = '<div class="empty-state">Could not load suggestions.</div>';
});

setInterval(() => {
  loadData().catch((error) => {
    console.error(error);
    setStatus('Sync issue');
  });
}, 20000);
