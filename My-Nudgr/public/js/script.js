document.addEventListener('DOMContentLoaded', function() {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('✅ Service worker registered at:', reg.scope))
            .catch(err => console.error('❌ Service worker registration failed:', err));
    }

    function setupBulkActions(formId, selectAllId, checkboxClass, counterId) {
        const form = document.getElementById(formId);
        const selectAllCheckbox = document.getElementById(selectAllId);
        const itemCheckboxes = document.querySelectorAll(`.${checkboxClass}`);
        const selectionCounter = document.getElementById(counterId);

        if (!form || !selectAllCheckbox || !selectionCounter) {
            return;
        }

        const updateCounter = () => {
            const selectedCount = document.querySelectorAll(`.${checkboxClass}:checked`).length;
            selectionCounter.textContent = `${selectedCount} item(s) selected`;
        };

        selectAllCheckbox.addEventListener('change', (e) => {
            itemCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            updateCounter();
        });

        itemCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (!checkbox.checked) {
                    selectAllCheckbox.checked = false;
                }
                updateCounter();
            });
        });

        form.addEventListener('submit', (e) => {
            const selectedCount = document.querySelectorAll(`.${checkboxClass}:checked`).length;
            if (selectedCount === 0) {
                alert('Please select at least one item.');
                e.preventDefault();
                return;
            }
            if (!confirm(`Are you sure you want to delete ${selectedCount} selected item(s)? This action cannot be undone.`)) {
                e.preventDefault();
            }
        });

        updateCounter();
    }

    setupBulkActions('active-reminders-form', 'select-all-active', 'active-reminder-checkbox', 'active-selection-counter');
    setupBulkActions('history-reminders-form', 'select-all-history', 'history-reminder-checkbox', 'history-selection-counter');

    const recurrenceBuilder = document.querySelector('.recurrence-builder');
    if (recurrenceBuilder) {
        const freqSelect = document.getElementById('recurrence_freq');
        const intervalInput = document.getElementById('recurrence_interval');
        const freqLabel = document.getElementById('recurrence_freq_label');
        const everyLabel = document.getElementById('recurrence_every_label');
        const weeklyOptions = document.getElementById('weekly_options');
        const monthlyOptions = document.getElementById('monthly_options');
        const endDateGroup = document.getElementById('recurrence_end_date_group');
        const recurrenceEndDateInput = document.getElementById('recurrence_end_date');
        const rruleInput = document.getElementById('recurrence_rule');
        const form = document.getElementById('reminderForm');

        const manageUI = () => {
            const freq = freqSelect.value;
            const plural = parseInt(intervalInput.value, 10) > 1;

            weeklyOptions.style.display = 'none';
            monthlyOptions.style.display = 'none';
            endDateGroup.style.display = 'block';

            if (freq === 'none') {
                freqLabel.textContent = '';
                everyLabel.textContent = '';
                intervalInput.style.display = 'none';
                endDateGroup.style.display = 'none';
            } else {
                everyLabel.textContent = 'Every';
                intervalInput.style.display = 'inline-block';
                switch (freq) {
                    case 'DAILY':
                        freqLabel.textContent = plural ? 'days' : 'day';
                        break;
                    case 'WEEKLY':
                        freqLabel.textContent = plural ? 'weeks' : 'week';
                        weeklyOptions.style.display = 'block';
                        break;
                    case 'MONTHLY':
                        freqLabel.textContent = plural ? 'months' : 'month';
                        monthlyOptions.style.display = 'block';
                        break;
					case 'YEARLY':
                        freqLabel.textContent = plural ? 'years' : 'year';
                        break;
                }
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
                const byday = Array.from(document.querySelectorAll('#weekly_options input[name="byday"]:checked'))
                                             .map(cb => cb.value).join(',');
                if (byday) parts.push(`BYDAY=${byday}`);
            }

            if (freq === 'MONTHLY') {
                const monthlyType = document.querySelector('input[name="monthly_type"]:checked').value;
                if (monthlyType === 'byday') {
                    const pos = document.getElementById('monthly_byday_pos').value;
                    const day = document.getElementById('monthly_byday_day').value;

                    if (['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'DAY', 'WEEKDAY', 'WEEKEND'].includes(day)) {
                        let byDayValue = day;
                        if (['1','2','3','4','-1'].includes(pos) && !['DAY','WEEKDAY','WEEKEND'].includes(day)) {
                            byDayValue = pos + day;
                        }
                        parts.push(`BYDAY=${byDayValue}`);
                    }
                } else if (monthlyType === 'bymonthday') {
                    // No BYMONTHDAY needed for this type as it's implicit from FREQ=MONTHLY without BYDAY
                }
            }

            return parts.join(';');
        };
        
        const initializeRecurrenceForm = () => {
            const rruleString = rruleInput.value;

            freqSelect.value = 'none';
            intervalInput.value = '1';
            document.querySelectorAll('#weekly_options input[name="byday"]').forEach(cb => cb.checked = false);
            document.querySelector('input[name="monthly_type"][value="bymonthday"]').checked = true;
            if (document.getElementById('monthly_byday_pos')) document.getElementById('monthly_byday_pos').value = '1';
            if (document.getElementById('monthly_byday_day')) document.getElementById('monthly_byday_day').value = 'SU';

            if (!rruleString || rruleString === 'none') {
                manageUI();
                return;
            }

            const parts = rruleString.split(';');
            const rruleData = {};
            parts.forEach(part => {
                const [key, value] = part.split('=');
                rruleData[key] = value;
            });

            if (rruleData.FREQ) {
                freqSelect.value = rruleData.FREQ;
            }
            if (rruleData.INTERVAL) {
                intervalInput.value = rruleData.INTERVAL;
            }

            if (rruleData.BYDAY && rruleData.FREQ === 'WEEKLY') {
                const byDays = rruleData.BYDAY.split(',');
                document.querySelectorAll('#weekly_options input[name="byday"]').forEach(checkbox => {
                    checkbox.checked = byDays.includes(checkbox.value);
                });
            }

            if (rruleData.FREQ === 'MONTHLY') {
                if (rruleData.BYMONTHDAY) {
                    document.querySelector('input[name="monthly_type"][value="bymonthday"]').checked = true;
                } else if (rruleData.BYDAY) {
                    document.querySelector('input[name="monthly_type"][value="byday"]').checked = true;
                    const byDayValue = rruleData.BYDAY;
                    let pos = '1';
                    let day = byDayValue;

                    if (byDayValue.length > 2 && (byDayValue.startsWith('1') || byDayValue.startsWith('2') ||
                                                  byDayValue.startsWith('3') || byDayValue.startsWith('4') ||
                                                  byDayValue.startsWith('-1'))) {
                        pos = byDayValue.substring(0, byDayValue.length - 2);
                        day = byDayValue.substring(byDayValue.length - 2);
                    }

                    if (document.getElementById('monthly_byday_pos')) {
                        document.getElementById('monthly_byday_pos').value = pos;
                    }
                    if (document.getElementById('monthly_byday_day')) {
                        document.getElementById('monthly_byday_day').value = day;
                    }
                }
            }
            manageUI();
        };

        freqSelect.addEventListener('change', manageUI);
        intervalInput.addEventListener('input', manageUI);

        document.querySelectorAll('#weekly_options input[name="byday"]').forEach(cb => cb.addEventListener('change', () => rruleInput.value = buildRruleString()));
        document.querySelectorAll('input[name="monthly_type"]').forEach(radio => radio.addEventListener('change', () => rruleInput.value = buildRruleString()));
        document.getElementById('monthly_byday_pos').addEventListener('change', () => rruleInput.value = buildRruleString());
        document.getElementById('monthly_byday_day').addEventListener('change', () => rruleInput.value = buildRruleString());
        recurrenceEndDateInput.addEventListener('change', () => rruleInput.value = buildRruleString());


        form.addEventListener('submit', () => {
            rruleInput.value = buildRruleString();
        });

        initializeRecurrenceForm();
    }

    const accordions = document.querySelectorAll('details.accordion summary');
    accordions.forEach(summary => {
        summary.addEventListener('click', function(event) {
            if (this.parentElement.hasAttribute('open')) {
            } else {
                accordions.forEach(acc => {
                    if (acc !== this && acc.parentElement.hasAttribute('open')) {
                    }
                });
            }
        });
    });

    const apiKeyDisplay = document.getElementById('apiKeyDisplay');
    if (apiKeyDisplay) {
        window.copyApiKey = function() {
            const key = apiKeyDisplay.textContent;
            navigator.clipboard.writeText(key).then(function() {
                alert('API Key copied to clipboard!');
            }, function(err) {
                alert('Failed to copy API Key: ' + err);
            });
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
            alertIntervalInput.value = '';
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