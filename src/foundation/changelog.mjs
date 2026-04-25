const VERSION_HEADING_PATTERN = /^## \[(?<version>\d+\.\d+\.\d+)] - (?<date>\d{4}-\d{2}-\d{2})$/m;

export const CHANGELOG_SECTIONS = ['Breaking Changes', 'Features', 'Fixes', 'Documentation', 'Maintenance'];

export function normalizeReleaseEntry(entry) {
  const number = Number(entry.number);
  const title = String(entry.title ?? '').trim();
  const url = String(entry.url ?? '').trim();
  const labels = Array.isArray(entry.labels) ? entry.labels.map(normalizeLabel) : [];

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('Release entry number must be a positive integer');
  }

  if (!title) {
    throw new Error(`Release entry #${number} must have a title`);
  }

  if (!url) {
    throw new Error(`Release entry #${number} must have a URL`);
  }

  return {
    number,
    title: redactPrivateData(title),
    url,
    labels,
    issues: extractIssueReferences(entry)
  };
}

export function renderReleaseNotes({ version, date, entries }) {
  if (!isStableVersion(version)) {
    throw new Error('Release notes version must use MAJOR.MINOR.PATCH format');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Release notes date must use YYYY-MM-DD format');
  }

  const normalizedEntries = entries.map(normalizeReleaseEntry);
  const grouped = groupEntriesBySection(normalizedEntries);
  const lines = [
    `## [${version}] - ${date}`,
    '',
    '> Review required before publication: confirm titles and linked issues contain no private data, secrets, credentials, tokens, Telegram API hashes, private keys, or private message content.',
    ''
  ];

  for (const section of CHANGELOG_SECTIONS) {
    const sectionEntries = grouped.get(section) ?? [];
    if (sectionEntries.length === 0) {
      continue;
    }

    lines.push(`### ${section}`);
    for (const entry of sectionEntries) {
      const issueLinks = entry.issues.length > 0 ? `; refs ${entry.issues.join(', ')}` : '';
      lines.push(`- ${entry.title} ([#${entry.number}](${entry.url})${issueLinks})`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function prependReleaseNotes(existingChangelog, releaseNotes) {
  if (!existingChangelog.trim()) {
    return `# Changelog\n\n${releaseNotes}`;
  }

  const heading = releaseNotes.match(VERSION_HEADING_PATTERN);
  if (!heading) {
    throw new Error('Release notes must start with a version heading');
  }

  if (existingChangelog.includes(heading[0])) {
    throw new Error(`Changelog already contains ${heading[0]}`);
  }

  const insertionPoint = existingChangelog.indexOf('\n## ');
  if (insertionPoint === -1) {
    return `${existingChangelog.trimEnd()}\n\n${releaseNotes}`;
  }

  return `${existingChangelog.slice(0, insertionPoint).trimEnd()}\n\n${releaseNotes}${existingChangelog.slice(insertionPoint + 1)}`;
}

export function groupEntriesBySection(entries) {
  const grouped = new Map(CHANGELOG_SECTIONS.map((section) => [section, []]));

  for (const entry of entries) {
    grouped.get(sectionForEntry(entry)).push(entry);
  }

  for (const sectionEntries of grouped.values()) {
    sectionEntries.sort((left, right) => left.number - right.number);
  }

  return grouped;
}

function sectionForEntry(entry) {
  const labels = new Set(entry.labels);

  if (labels.has('breaking-change') || labels.has('major')) {
    return 'Breaking Changes';
  }

  if (labels.has('feature') || labels.has('enhancement')) {
    return 'Features';
  }

  if (labels.has('bug') || labels.has('fix')) {
    return 'Fixes';
  }

  if (labels.has('documentation') || labels.has('docs')) {
    return 'Documentation';
  }

  return 'Maintenance';
}

function extractIssueReferences(entry) {
  const references = new Set();
  const fields = [entry.body, entry.mergeCommitMessage, entry.title].filter(Boolean);

  for (const field of fields) {
    const matches = String(field).matchAll(/\b(?:fixes|closes|resolves|refs|references)\s+#(?<number>\d+)/gi);
    for (const match of matches) {
      references.add(`#${match.groups.number}`);
    }
  }

  return [...references].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
}

function normalizeLabel(label) {
  if (typeof label === 'string') {
    return label.toLowerCase();
  }

  return String(label.name ?? '').toLowerCase();
}

function redactPrivateData(value) {
  return value
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[REDACTED_TOKEN]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, '[REDACTED_TOKEN]')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]');
}

function isStableVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}
