document.addEventListener('DOMContentLoaded', function() {

	const newReminderButton = document.getElementById('newReminderButton');
    const reminderFormContainer = document.getElementById('reminderFormContainer');
    const closeReminderFormButton = document.getElementById('closeReminderFormButton');
	const activeRemindersAccordion = document.querySelector('.accordion.card');

    const toggleFormAndButtonVisibility = (showForm) => {
        if (!reminderFormContainer || !newReminderButton) {
            console.warn("Missing reminder form elements. Cannot toggle visibility.");
            return;
        }

        if (showForm) {
            reminderFormContainer.removeAttribute('hidden');
            newReminderButton.setAttribute('hidden', '');
            setTimeout(() => {
                reminderFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        } else {
            reminderFormContainer.setAttribute('hidden', '');
            newReminderButton.removeAttribute('hidden');
			
			if (activeRemindersAccordion) {
                setTimeout(() => {
                    const accordionTop = activeRemindersAccordion.getBoundingClientRect().top + window.scrollY;

                    const desiredOffset = 200;

                    const targetScrollPosition = Math.max(0, accordionTop - desiredOffset);

                    window.scrollTo({
                        top: targetScrollPosition,
                        behavior: 'smooth'
                    });
                }, 50);
            }
        }
    };

    if (newReminderButton) {
        newReminderButton.addEventListener('click', () => {
            toggleFormAndButtonVisibility(true);
        });
    }

    if (closeReminderFormButton) {
        closeReminderFormButton.addEventListener('click', () => {
            toggleFormAndButtonVisibility(false);
        });
    }

    if (reminderFormContainer && !reminderFormContainer.hasAttribute('hidden')) {
        setTimeout(() => {
            reminderFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

	
    /**
     * Sets up bulk action checkboxes and button handling for a given section.
     * @param {string} sectionContainerSelector The CSS selector for the container holding reminders (e.g., '.accordion.card > .accordion-content > .reminders-section' or '#history-reminders-section').
     * @param {string} selectAllId The ID of the "Select All" checkbox.
     * @param {string} checkboxClass The class for all checkboxes in the list.
     * @param {string} counterId The ID of the element to display the selection count.
     * @param {string|null} archiveButtonId The ID of the bulk archive button (null if not present).
     * @param {string|null} deleteButtonId The ID of the bulk delete button (null if not present).
     * @param {string|null} archiveFormId The ID of the bulk archive form (null if not present).
     * @param {string|null} deleteFormId The ID of the bulk delete form (null if not present).
     */
    function setupBulkActions(sectionContainerSelector, selectAllId, checkboxClass, counterId, archiveButtonId, deleteButtonId, archiveFormId, deleteFormId) {
        const sectionContainer = document.querySelector(sectionContainerSelector);
        if (!sectionContainer) {
            console.warn(`Section container with selector '${sectionContainerSelector}' not found. Cannot set up bulk actions.`);
            return;
        }

        const selectAllCheckbox = sectionContainer.querySelector(`#${selectAllId}`);
        const selectionCounter = sectionContainer.querySelector(`#${counterId}`);

        if (!selectAllCheckbox || !selectionCounter) {
            return;
        }

        const itemCheckboxes = sectionContainer.querySelectorAll(`.${checkboxClass}`);

        const archiveForm = archiveFormId ? document.getElementById(archiveFormId) : null;
        const deleteForm = deleteFormId ? document.getElementById(deleteFormId) : null;

        const archiveButton = archiveButtonId ? document.getElementById(archiveButtonId) : (archiveForm ? archiveForm.querySelector('button[type="submit"]') : null);
        const deleteButton = deleteButtonId ? document.getElementById(deleteButtonId) : (deleteForm ? deleteForm.querySelector('button[type="submit"]') : null);
        
        const updateCounterAndButtonStates = () => {
            const selectedCount = sectionContainer.querySelectorAll(`.${checkboxClass}:checked`).length;
            selectionCounter.textContent = `${selectedCount} item(s) selected`;

            if (archiveButton) archiveButton.disabled = selectedCount === 0;
            if (deleteButton) deleteButton.disabled = selectedCount === 0;
        };

        selectAllCheckbox.addEventListener('change', (e) => {
            itemCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            updateCounterAndButtonStates();
        });

        itemCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (!checkbox.checked) {
                    selectAllCheckbox.checked = false;
                }
                updateCounterAndButtonStates();
            });
        });

        if (archiveButton && archiveForm) {
            archiveButton.addEventListener('click', (e) => {
                e.preventDefault();

                const selectedReminderIds = Array.from(sectionContainer.querySelectorAll(`.${checkboxClass}:checked`))
                                                .map(cb => cb.value);

                if (selectedReminderIds.length === 0) {
                    alert('Please select at least one item to archive.');
                    return;
                }

                if (confirm(`Are you sure you want to archive ${selectedReminderIds.length} selected item(s)?`)) {
                    archiveForm.querySelectorAll('input[name="reminderIds"]').forEach(input => input.remove());
                    selectedReminderIds.forEach(id => {
                        const hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.name = 'reminderIds';
                        hiddenInput.value = id;
                        archiveForm.appendChild(hiddenInput);
                    });
                    archiveForm.submit();
                }
            });
        }

        if (deleteButton && deleteForm) {
            deleteButton.addEventListener('click', (e) => {
                e.preventDefault();

                const selectedReminderIds = Array.from(sectionContainer.querySelectorAll(`.${checkboxClass}:checked`))
                                                .map(cb => cb.value);

                if (selectedReminderIds.length === 0) {
                    alert('Please select at least one item to delete.');
                    return;
                }

                if (!confirm(`Are you sure you want to delete ${selectedReminderIds.length} selected item(s)? This action cannot be undone.`)) {
                    return;
                }

                deleteForm.querySelectorAll('input[name="reminderIds"]').forEach(input => input.remove());
                selectedReminderIds.forEach(id => {
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = 'reminderIds';
                    hiddenInput.value = id;
                    deleteForm.appendChild(hiddenInput);
                });
                deleteForm.submit();
            });
        }

        updateCounterAndButtonStates();
    }

    setupBulkActions(
        '.accordion.card > .accordion-content > .reminders-section',
        'select-all-active',
        'active-reminder-checkbox',
        'active-selection-counter',
        'archiveSelectedButton',
        'deleteSelectedButton',
        'active-reminders-archive-form',
        'active-reminders-delete-form'
    );

    setupBulkActions(
        '#history-reminders-section',
        'select-all-history',
        'history-reminder-checkbox',
        'history-selection-counter',
        null,
        null,
        null,
        'history-reminders-form'
    );

	const recurrenceBuilder = document.querySelector('.recurrence-builder');
    if (recurrenceBuilder) {
        const freqSelect = document.getElementById('recurrence_freq');
        const intervalInput = document.getElementById('recurrence_interval');
        const freqLabel = document.getElementById('recurrence_freq_label');
        const everyLabel = document.getElementById('recurrence_every_label');
        const weeklyOptions = document.getElementById('weekly_options');
        const monthlyOptions = document.getElementById('monthly_options');
        const endDateGroup = document.getElementById('recurrence_end_date_group');
        const rruleInput = document.getElementById('recurrence_rule');
        const form = document.getElementById('reminderForm');

        const manageUI = () => {
            const freq = freqSelect.value;
            const plural = intervalInput.value > 1;

            weeklyOptions.style.display = 'none';
            monthlyOptions.style.display = 'none';
            endDateGroup.style.display = 'block';

            switch (freq) {
                case 'none':
                    freqLabel.textContent = '';
                    everyLabel.textContent = '';
                    intervalInput.style.display = 'none';
                    endDateGroup.style.display = 'none';
                    break;
                case 'DAILY':
                    freqLabel.textContent = plural ? 'days' : 'day';
                    everyLabel.textContent = 'Every';
                    intervalInput.style.display = 'inline-block';
                    break;
                case 'WEEKLY':
                    freqLabel.textContent = plural ? 'weeks' : 'week';
                    everyLabel.textContent = 'Every';
                    intervalInput.style.display = 'inline-block';
                    weeklyOptions.style.display = 'block';
                    break;
                case 'MONTHLY':
                    freqLabel.textContent = plural ? 'months' : 'month';
                    everyLabel.textContent = 'Every';
                    intervalInput.style.display = 'inline-block';
                    monthlyOptions.style.display = 'block';
                    break;
            }
        };

        const buildRruleString = () => {
            const freq = freqSelect.value;
            if (freq === 'none') return '';

            let parts = [`FREQ=${freq}`];
            const interval = parseInt(intervalInput.value, 10);
            if (interval > 1) {
                parts.push(`INTERVAL=${interval}`);
            }

            if (freq === 'WEEKLY') {
                const byday = Array.from(document.querySelectorAll('input[name="byday"]:checked'))
                                 .map(cb => cb.value).join(',');
                if (byday) parts.push(`BYDAY=${byday}`);
            }

            if (freq === 'MONTHLY') {
                const monthlyType = document.querySelector('input[name="monthly_type"]:checked').value;
                if (monthlyType === 'byday') {
                    const pos = document.getElementById('monthly_byday_pos').value;
                    const day = document.getElementById('monthly_byday_day').value;
                    parts.push(`BYDAY=${day}`);
                    if (['1','2','3','4','-1'].includes(pos)) {
                         parts.push(`BYSETPOS=${pos}`);
                    }
                }
            }
            return parts.join(';');
        };

        freqSelect.addEventListener('change', manageUI);
        intervalInput.addEventListener('input', manageUI);
        form.addEventListener('submit', () => {
            rruleInput.value = buildRruleString();
        });

        manageUI();
    }

    const accordions = document.querySelectorAll('details.accordion summary');
    accordions.forEach(summary => {
        summary.addEventListener('click', function(event) {

        });
    });

    const apiKeyDisplay = document.getElementById('apiKeyDisplay');
    if (apiKeyDisplay) {
        window.copyApiKey = function() {
            const key = apiKeyDisplay.textContent;
            try {
                const textarea = document.createElement('textarea');
                textarea.value = key;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('API Key copied to clipboard!');
            } catch (err) {
                alert('Failed to copy API Key: ' + err);
            }
        };
    }

    window.toggleWebhookConfig = function() {
        const configDetails = document.getElementById('webhookConfig');
        const arrow = document.querySelector('.webhook-config-toggle .arrow');
        if (configDetails.style.display === 'none' || configDetails.style.display === '') {
            configDetails.style.display = 'block';
            if(arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            configDetails.style.display = 'none';
            if(arrow) arrow.style.transform = 'rotate(0deg)';
        }
    };

    const dueDateTimeInput = document.getElementById('due_datetime_local');
    const reminderForm = document.getElementById('reminderForm');

    if (dueDateTimeInput && reminderForm && !reminderForm.action.includes('/update-reminder/')) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        now.setSeconds(0);
        now.setMilliseconds(0);
        dueDateTimeInput.min = now.toISOString().slice(0, 16);
    }

    const clearHistoryForm = document.querySelector('form[action="/clear-all-history"]');
    if (clearHistoryForm) {
        clearHistoryForm.addEventListener('submit', function(event) {
            if (!confirm('Are you absolutely sure you want to delete ALL reminders in history? This action cannot be undone.')) {
                event.preventDefault();
            }
        });
    }

    const recurrenceRuleSelect = document.getElementById('recurrence_rule');
	const recurrenceEndDateGroup = document.getElementById('recurrence_end_date_group');

	if (recurrenceRuleSelect) {
		recurrenceRuleSelect.addEventListener('change', function() {
			if (this.value === 'none') {
				recurrenceEndDateGroup.style.display = 'none';
			} else {
				recurrenceEndDateGroup.style.display = 'block';
			}
		});
	}

	const alertCountInput = document.getElementById('alert_repeat_additional_count');
    const alertIntervalInput = document.getElementById('alert_repeat_interval_minutes');
    const alertIntervalLabel = document.querySelector('label[for="alert_repeat_interval_minutes"]');

    function toggleIntervalRequirement() {
        if (!alertCountInput || !alertIntervalInput || !alertIntervalLabel) return;

        const count = parseInt(alertCountInput.value, 10);

        if (count > 0) {
            alertIntervalInput.required = true;
            alertIntervalInput.disabled = false;
            alertIntervalLabel.classList.add('required-label');
            if (!alertIntervalInput.value) {
                alertIntervalInput.value = 5;
            }
        } else {
            alertIntervalInput.required = false;
            alertIntervalInput.disabled = true;
            alertIntervalLabel.classList.remove('required-label');
        }
    }

    if (alertCountInput) {
        alertCountInput.addEventListener('input', toggleIntervalRequirement);

        toggleIntervalRequirement();
    }
	
    setTimeout(() => {
        const messages = document.querySelectorAll('.message');
        messages.forEach(msg => {
            msg.style.transition = 'opacity 0.5s ease';
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 500);
        });
    }, 5000);

});
