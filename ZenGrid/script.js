/**
 * ZenGrid - Minimalist Habit Tracker
 * Core Application Logic (Refined & Corrected)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // State & Constants
    // ==========================================================================
    let habits = [];
    const STORAGE_KEY = 'zengrid_habits';
    const THEME_KEY = 'zengrid_theme';

    // DOM Elements
    const themeToggleBtn = document.getElementById('theme-toggle');
    const addHabitForm = document.getElementById('add-habit-form');
    const habitNameInput = document.getElementById('habit-name-input');
    const habitGoalInput = document.getElementById('habit-goal-input');
    const habitsContainer = document.getElementById('habits-container');
    const emptyState = document.getElementById('empty-state');
    const habitsCounter = document.getElementById('habits-counter');

    // Global Statistics Elements
    const statCompletion = document.getElementById('stat-completion');
    const statActive = document.getElementById('stat-active');
    const statTotal = document.getElementById('stat-total');
    const statStreak = document.getElementById('stat-streak');

    // Action Buttons
    const btnExport = document.getElementById('btn-export');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const importFileInput = document.getElementById('import-file-input');
    const btnReset = document.getElementById('btn-reset');
    const toast = document.getElementById('toast');

    // ==========================================================================
    // Date Helpers
    // ==========================================================================
    
    // Returns local date string in YYYY-MM-DD format
    function getLocalDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Parse YYYY-MM-DD into a Date object at local noon (prevents DST timezone offset shifts)
    function parseLocalDate(dateStr) {
        const parts = dateStr.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day, 12, 0, 0, 0);
    }

    // Get array of last 7 dates ending today
    function getWeeklyDates() {
        const dates = [];
        const today = new Date();
        today.setHours(12, 0, 0, 0); // noon-safe
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            dates.push({
                dateStr: getLocalDateString(d),
                dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                dayNum: d.getDate(),
                isToday: i === 0
            });
        }
        return dates;
    }

    // Get array of last W weeks (columns), aligned from Monday to Sunday, ending on Sunday of current week
    function getGridDates(W = 10) {
        const dates = [];
        const today = new Date();
        today.setHours(12, 0, 0, 0); // noon-safe
        
        // Find today's day of week (Monday = 0, Sunday = 6)
        // today.getDay() is 0 (Sun), 1 (Mon), ..., 6 (Sat)
        const todayDayIndex = (today.getDay() + 6) % 7; 
        
        // Find the Monday of the week W-1 weeks ago
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - todayDayIndex - (W - 1) * 7);
        
        const totalDays = W * 7;
        const todayStr = getLocalDateString(today);
        
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const dateStr = getLocalDateString(d);
            
            dates.push({
                dateStr: dateStr,
                label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                isToday: dateStr === todayStr,
                isFuture: dateStr > todayStr,
                monthName: d.toLocaleDateString('en-US', { month: 'short' }),
                dayIndex: i
            });
        }
        return dates;
    }

    // ==========================================================================
    // Storage & Theme Functions
    // ==========================================================================
    function loadData() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            habits = stored ? JSON.parse(stored) : [];
        } catch (e) {
            showToast('Error loading habits data', 'danger');
            habits = [];
        }
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
        } catch (e) {
            showToast('Error saving data to browser', 'danger');
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
    });

    // ==========================================================================
    // Analytics Calculations (Timezone & Midnight Safe)
    // ==========================================================================
    
    // Calculates Current and Best Streak for a single habit
    function calculateStreaks(habit) {
        const todayStr = getLocalDateString(new Date());
        
        // Get all completed dates, sorted chronologically
        const completedDates = Object.keys(habit.history)
            .filter(d => habit.history[d] === true)
            .sort();

        if (completedDates.length === 0) {
            return { current: 0, best: 0, totalCompletions: 0 };
        }

        // 1. Total completions
        const totalCompletions = completedDates.length;

        // Create set of completed dates for quick lookup
        const completedSet = new Set(completedDates);

        // 2. Best Streak Calculation
        let best = 0;
        let currentRunning = 0;
        
        // Find earliest checked date
        const startDate = parseLocalDate(completedDates[0]);
        const endDate = parseLocalDate(todayStr);
        
        // Loop from start date to today day-by-day in local time
        let currentLoopDate = new Date(startDate);
        while (currentLoopDate <= endDate) {
            const currentLoopStr = getLocalDateString(currentLoopDate);
            if (completedSet.has(currentLoopStr)) {
                currentRunning++;
            } else {
                best = Math.max(best, currentRunning);
                currentRunning = 0;
            }
            currentLoopDate.setDate(currentLoopDate.getDate() + 1);
        }
        best = Math.max(best, currentRunning);

        // 3. Current Streak Calculation
        let current = 0;
        let checkDate = new Date(); // Start today
        checkDate.setHours(12, 0, 0, 0); // noon-safe
        let checkStr = getLocalDateString(checkDate);

        // If today is completed, start scanning today. 
        // If not completed, but yesterday was completed, start yesterday.
        // Otherwise, current streak is 0.
        if (habit.history[checkStr] === true) {
            while (habit.history[getLocalDateString(checkDate)] === true) {
                current++;
                checkDate.setDate(checkDate.getDate() - 1);
            }
        } else {
            // Check yesterday
            const yestDate = new Date();
            yestDate.setDate(yestDate.getDate() - 1);
            yestDate.setHours(12, 0, 0, 0); // noon-safe
            const yestStr = getLocalDateString(yestDate);
            if (habit.history[yestStr] === true) {
                checkDate = yestDate;
                while (habit.history[getLocalDateString(checkDate)] === true) {
                    current++;
                    checkDate.setDate(checkDate.getDate() - 1);
                }
            }
        }

        return { current, best, totalCompletions };
    }

    // Update global dashboard statistics
    function updateGlobalStats() {
        const todayStr = getLocalDateString(new Date());
        const totalHabits = habits.length;
        
        let completedToday = 0;
        let grandTotalCompletions = 0;
        let longestActiveStreak = 0;

        habits.forEach(habit => {
            if (habit.history[todayStr] === true) {
                completedToday++;
            }
            
            const stats = calculateStreaks(habit);
            grandTotalCompletions += stats.totalCompletions;
            if (stats.current > longestActiveStreak) {
                longestActiveStreak = stats.current;
            }
        });

        // Today's Completion rate
        const rate = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;
        
        // Update DOM with animations
        animateNumber(statCompletion, rate, '%');
        animateNumber(statActive, totalHabits);
        animateNumber(statTotal, grandTotalCompletions);
        animateNumber(statStreak, longestActiveStreak, 'd');

        // Update list header count
        habitsCounter.textContent = `${totalHabits} Habit${totalHabits !== 1 ? 's' : ''}`;
    }

    // Number counting animation
    function animateNumber(element, target, suffix = '') {
        const start = parseInt(element.textContent) || 0;
        if (start === target) {
            element.textContent = target + suffix;
            return;
        }
        
        const duration = 400; // ms
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quad
            const easeProgress = progress * (2 - progress);
            const currentVal = Math.round(start + easeProgress * (target - start));
            element.textContent = currentVal + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    }

    // ==========================================================================
    // UI Render Functions
    // ==========================================================================
    function renderHabits() {
        // Clear current elements
        habitsContainer.innerHTML = '';

        if (habits.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        } else {
            emptyState.classList.add('hidden');
        }

        habits.forEach(habit => {
            const card = document.createElement('article');
            const targetGoal = habit.targetGoal || 30; // fallback to 30 if undefined
            
            const stats = calculateStreaks(habit);
            const isAchieved = stats.totalCompletions >= targetGoal;
            
            card.className = `card habit-card ${isAchieved ? 'achieved' : ''}`;
            card.dataset.id = habit.id;

            const weeklyDates = getWeeklyDates();
            const gridDates = getGridDates(10); // 10 columns (70 days)

            // Progress calculations
            const completionPercent = Math.min(Math.round((stats.totalCompletions / targetGoal) * 100), 100);

            // Generate HTML for Weekly Track Row
            let weeklyTrackHTML = '';
            weeklyDates.forEach(wd => {
                const isChecked = habit.history[wd.dateStr] === true;
                const checkClass = isChecked ? 'day-check-btn checked' : 'day-check-btn';
                const dayLabel = wd.isToday ? 'Today' : wd.dayName;
                
                weeklyTrackHTML += `
                    <div class="day-column">
                        <span class="day-label" style="${wd.isToday ? 'color: var(--text-primary); font-weight: 700;' : ''}">${dayLabel}</span>
                        <button class="${checkClass}" data-date="${wd.dateStr}" aria-label="Toggle ${habit.name} for ${wd.dateStr}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                    </div>
                `;
            });

            // Generate HTML for Month Labels at the top of the columns
            let monthLabelsHTML = '';
            let lastMonthName = '';
            for (let col = 0; col < 10; col++) {
                const weekStartDate = gridDates[col * 7];
                const currentMonthName = weekStartDate.monthName;
                
                // If it is the first column or the month changes
                if (col === 0 || currentMonthName !== lastMonthName) {
                    monthLabelsHTML += `<span style="grid-column: ${col + 1};">${currentMonthName}</span>`;
                    lastMonthName = currentMonthName;
                }
            }

            // Generate HTML for grid cells
            let gridCellsHTML = '';
            gridDates.forEach(gd => {
                const isChecked = habit.history[gd.dateStr] === true;
                const isToday = gd.isToday;
                const isFuture = gd.isFuture;
                
                let cellClass = 'grid-cell';
                if (isChecked) cellClass += ' filled';
                if (isToday) cellClass += ' active-today';
                if (isFuture) cellClass += ' future';
                
                let statusText = 'Not completed';
                if (isFuture) {
                    statusText = 'Future date';
                } else if (isChecked) {
                    statusText = 'Completed';
                }
                const tooltipText = `${gd.label}: ${statusText}`;

                gridCellsHTML += `
                    <div class="${cellClass}" data-date="${gd.dateStr}" data-tooltip="${tooltipText}"></div>
                `;
            });

            // Achieve badge rendering
            const badgeHTML = isAchieved 
                ? `<span class="achievement-badge">🏆 Goal Achieved</span>`
                : '';

            // Assemble Card
            card.innerHTML = `
                <div class="habit-header-row">
                    <div class="habit-title-area">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <h3 class="habit-name">${escapeHTML(habit.name)}</h3>
                            ${badgeHTML}
                        </div>
                        <div class="habit-streaks">
                            <span class="streak-badge">
                                <span class="fire-icon">🔥</span> Current Streak: <span class="streak-number">${stats.current}d</span>
                            </span>
                            <span class="streak-badge">
                                <span class="fire-icon">🏆</span> Best Streak: <span class="streak-number">${stats.best}d</span>
                            </span>
                        </div>
                    </div>
                    <div class="habit-actions">
                        <button class="btn-delete" aria-label="Delete habit">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Goal Progress Bar -->
                <div class="habit-progress-area">
                    <div class="habit-progress-header">
                        <span>Target Goal: ${targetGoal} days</span>
                        <span>${stats.totalCompletions} / ${targetGoal} completed (${completionPercent}%)</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${completionPercent}%"></div>
                    </div>
                </div>

                <!-- Weekly Tracker -->
                <div class="weekly-track">
                    ${weeklyTrackHTML}
                </div>

                <!-- Footer & Drawer Toggles -->
                <div class="habit-footer">
                    <button class="btn-toggle-grid" aria-expanded="false">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        <span>Show 70-Day Grid</span>
                    </button>
                    <span class="habit-completion-percentage">${stats.totalCompletions} total check-ins</span>
                </div>

                <!-- Expanded Contribution Grid Drawer (Redesigned & Weekday-Aligned) -->
                <div class="grid-section">
                    <div class="grid-title">70-Day Activity History</div>
                    <div class="contribution-grid-container">
                        <div class="grid-wrapper">
                            <!-- Weekday labels on the left of grid -->
                            <div class="grid-y-labels">
                                <span>M</span>
                                <span></span>
                                <span>W</span>
                                <span></span>
                                <span>F</span>
                                <span></span>
                                <span></span>
                            </div>
                            <div class="grid-columns-container">
                                <!-- Month labels at top -->
                                <div class="grid-month-labels">
                                    ${monthLabelsHTML}
                                </div>
                                <!-- The grid itself -->
                                <div class="contribution-grid">
                                    ${gridCellsHTML}
                                </div>
                            </div>
                        </div>
                        <div class="grid-footer-row">
                            <div class="grid-legend">
                                <span>Less</span>
                                <div class="legend-box empty"></div>
                                <div class="legend-box filled"></div>
                                <span>More</span>
                            </div>
                            <span class="habit-completion-percentage">Click any cell to toggle history</span>
                        </div>
                    </div>
                </div>
            `;

            // Attach Event Listeners to Card elements
            attachCardEvents(card, habit);

            habitsContainer.appendChild(card);
        });
    }

    // Attach local interactions within each card
    function attachCardEvents(cardElement, habit) {
        const habitId = habit.id;

        // 1. Weekly check-in buttons
        cardElement.querySelectorAll('.day-check-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const dateStr = btn.dataset.date;
                toggleCompletion(habitId, dateStr);
            });
        });

        // 2. Interactive grid cells (toggling dates directly in history grid!)
        cardElement.querySelectorAll('.grid-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (cell.classList.contains('future')) return; // ignore clicks on future days
                const dateStr = cell.dataset.date;
                toggleCompletion(habitId, dateStr);
            });
        });

        // 3. Expand / collapse contribution grid drawer
        const toggleGridBtn = cardElement.querySelector('.btn-toggle-grid');
        const gridSection = cardElement.querySelector('.grid-section');
        
        toggleGridBtn.addEventListener('click', () => {
            const isExpanded = toggleGridBtn.getAttribute('aria-expanded') === 'true';
            toggleGridBtn.setAttribute('aria-expanded', !isExpanded);
            toggleGridBtn.classList.toggle('active', !isExpanded);
            gridSection.classList.toggle('active', !isExpanded);
            toggleGridBtn.querySelector('span').textContent = isExpanded ? 'Show 70-Day Grid' : 'Hide 70-Day Grid';
        });

        // 4. Delete button handler
        const deleteBtn = cardElement.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete "${habit.name}"? This cannot be undone.`)) {
                deleteHabit(habitId);
            }
        });
    }

    // Escape raw input for HTML injection safety
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================================================
    // Core Action Handlers
    // ==========================================================================
    
    // Toggle check-in state
    function toggleCompletion(habitId, dateStr) {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;

        // Toggle state
        if (habit.history[dateStr] === true) {
            delete habit.history[dateStr];
        } else {
            habit.history[dateStr] = true;
        }

        saveData();
        renderHabits();
        updateGlobalStats();
    }

    // Add new habit
    addHabitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = habitNameInput.value.trim();
        if (!name) return;

        const targetGoal = parseInt(habitGoalInput.value, 10) || 30;

        const newHabit = {
            id: 'habit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: name,
            targetGoal: targetGoal,
            createdAt: getLocalDateString(new Date()),
            history: {}
        };

        habits.push(newHabit);
        saveData();
        addHabitForm.reset();
        
        // Reset goal input and pills back to default (30)
        habitGoalInput.value = 30;
        document.querySelectorAll('.goal-pill').forEach(pill => {
            if (pill.dataset.val === '30') {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
        
        renderHabits();
        updateGlobalStats();
        showToast(`Habit "${name}" added successfully`);
    });

    // Delete existing habit
    function deleteHabit(habitId) {
        const habitIdx = habits.findIndex(h => h.id === habitId);
        if (habitIdx === -1) return;

        const name = habits[habitIdx].name;
        habits.splice(habitIdx, 1);
        saveData();
        renderHabits();
        updateGlobalStats();
        showToast(`Deleted "${name}"`);
    }

    // ==========================================================================
    // Backup & Reset Actions
    // ==========================================================================
    
    // Export Data JSON
    btnExport.addEventListener('click', () => {
        if (habits.length === 0) {
            showToast('No habits data to export', 'danger');
            return;
        }
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(habits, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        
        const dateStr = getLocalDateString(new Date());
        downloadAnchor.setAttribute("download", `zengrid_backup_${dateStr}.json`);
        
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        
        showToast('Backup downloaded successfully');
    });

    // Trigger Hidden File Upload Form
    btnImportTrigger.addEventListener('click', () => {
        importFileInput.click();
    });

    // Import File Handler
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                
                // Simple validation check for data format
                if (Array.isArray(parsed) && (parsed.length === 0 || (parsed[0].id && parsed[0].name && parsed[0].history))) {
                    habits = parsed;
                    saveData();
                    renderHabits();
                    updateGlobalStats();
                    showToast('Backup imported successfully');
                } else {
                    showToast('Invalid backup file format', 'danger');
                }
            } catch (err) {
                showToast('Error parsing backup file', 'danger');
            }
            // Clear input so upload triggers again for same file name
            importFileInput.value = '';
        };
        reader.readAsText(file);
    });

    // Reset All Data
    btnReset.addEventListener('click', () => {
        if (confirm('CAUTION: Are you sure you want to delete all habits and history? This cannot be undone.')) {
            habits = [];
            saveData();
            renderHabits();
            updateGlobalStats();
            showToast('All habits cleared', 'danger');
        }
    });

    // ==========================================================================
    // Pill Selectors Logic
    // ==========================================================================
    document.querySelectorAll('.goal-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.goal-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const val = pill.dataset.val;
            if (habitGoalInput) {
                habitGoalInput.value = val;
            }
        });
    });

    if (habitGoalInput) {
        habitGoalInput.addEventListener('input', () => {
            const val = habitGoalInput.value;
            document.querySelectorAll('.goal-pill').forEach(p => {
                if (p.dataset.val === val) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });
        });
    }

    // ==========================================================================
    // Toast Notification System
    // ==========================================================================
    let toastTimeout;
    function showToast(message, type = 'success') {
        clearTimeout(toastTimeout);
        
        toast.textContent = message;
        toast.className = 'toast'; // reset class
        
        if (type === 'danger') {
            toast.style.borderColor = 'var(--color-danger)';
            toast.style.color = 'var(--color-danger)';
        } else {
            toast.style.borderColor = 'var(--border-subtle)';
            toast.style.color = 'var(--text-primary)';
        }
        
        toast.classList.remove('hidden');
        
        toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================
    initTheme();
    loadData();
    renderHabits();
    updateGlobalStats();
});
