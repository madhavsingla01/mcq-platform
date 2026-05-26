export const defaultShareSettings = {
  linkType: 'anyone',
  lifetime: 'forever',
  participantVisibility: 'all',
  chatSettings: 'enabled',
  chatFileSharing: 'images_only',
  postSubmissionAccess: 'review_answers',
  invitees: [],
  expiresAt: '',
};

export const shareSettingOptions = {
  linkType: [
    { key: 'anyone', letter: 'A', title: 'Anyone with link can join', detail: 'No account required' },
    { key: 'logged_in', letter: 'B', title: 'Only logged in users', detail: 'Requires an account' },
    { key: 'invite_only', letter: 'C', title: 'Invite-only later', detail: 'Only invited IDs can enter' },
  ],
  lifetime: [
    { key: 'forever', letter: 'A', title: 'Forever until creator destroys it', detail: 'Creator can deactivate any time' },
    { key: 'auto_expire', letter: 'B', title: 'Auto expire after inactivity', detail: 'Expires after 24 hours idle' },
    { key: 'manual', letter: 'C', title: 'Creator manually chooses expiry', detail: 'Pick date and time' },
  ],
  participantVisibility: [
    { key: 'all', letter: 'A', title: 'Show all participants', detail: 'Names are visible' },
    { key: 'count_only', letter: 'B', title: 'Show only participant count', detail: 'Names stay hidden' },
    { key: 'hidden', letter: 'C', title: 'Hide everything', detail: 'No participant info' },
  ],
  chatSettings: [
    { key: 'enabled', letter: 'A', title: 'Enable live discussion', detail: 'Everyone can chat' },
    { key: 'disabled', letter: 'B', title: 'Disable chat', detail: 'No messages allowed' },
    { key: 'read_only', letter: 'C', title: 'Read-only announcements later', detail: 'Creator can post updates' },
  ],
  chatFileSharing: [
    { key: 'images_only', letter: 'A', title: 'Images only', detail: 'Photos and screenshots' },
    { key: 'images_files', letter: 'B', title: 'Images + files', detail: 'Docs, sheets, PDFs' },
    { key: 'text_only', letter: 'C', title: 'Text only', detail: 'No attachments' },
  ],
  postSubmissionAccess: [
    { key: 'review_answers', letter: 'A', title: 'Can review answers', detail: 'Show correct and wrong' },
    { key: 'reopen_quiz', letter: 'B', title: 'Can reopen full quiz', detail: 'Retake from results' },
    { key: 'results_only', letter: 'C', title: 'Results only', detail: 'Score without review' },
  ],
};

const optionLookup = Object.fromEntries(
  Object.entries(shareSettingOptions).map(([group, options]) => [
    group,
    Object.fromEntries(options.map((option) => [option.key, option])),
  ])
);

export function getShareSettingOption(group, key) {
  return optionLookup[group]?.[key] || shareSettingOptions[group]?.[0] || null;
}

export function mergeShareSettings(settings = {}) {
  return {
    ...defaultShareSettings,
    ...settings,
    invitees: Array.isArray(settings.invitees) ? settings.invitees : [],
    expiresAt: settings.expiresAt || '',
  };
}

export function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function defaultManualExpiryValue() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return toDatetimeLocalValue(date.toISOString());
}

export function getSelectedShareSettings(settings = {}) {
  const merged = mergeShareSettings(settings);
  return [
    { label: 'Link access', option: getShareSettingOption('linkType', merged.linkType) },
    { label: 'Session lifetime', option: getShareSettingOption('lifetime', merged.lifetime) },
    { label: 'Participants', option: getShareSettingOption('participantVisibility', merged.participantVisibility) },
    { label: 'Chat', option: getShareSettingOption('chatSettings', merged.chatSettings) },
    { label: 'Chat attachments', option: getShareSettingOption('chatFileSharing', merged.chatFileSharing) },
    { label: 'After submission', option: getShareSettingOption('postSubmissionAccess', merged.postSubmissionAccess) },
  ].filter((item) => item.option);
}
