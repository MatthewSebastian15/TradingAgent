import PropTypes from 'prop-types';

import SectionHeader from '../SectionHeader';
import { safeExternalUrl } from '../../../utils/url';
import { formatPrice } from '../../../utils/formatting';

const OWNERSHIP_SEGMENTS = [
  { key: 'insider', label: 'Insider Ownership', color: '#f97316' },
  { key: 'institution', label: 'Institutional Ownership', color: '#3b82f6' },
  { key: 'public', label: 'Public Ownership', color: '#22c55e' },
];

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function display(value) {
  if (!hasValue(value)) return 'N/A';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

function displayDash(value) {
  return hasValue(value) ? display(value) : '-';
}

function numberOrNull(value) {
  if (!hasValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function profileNumber(value) {
  const number = numberOrNull(value);
  return number === null ? 'N/A' : number.toLocaleString('en-US');
}

function marketCapDisplay(profile = {}, result = {}) {
  const value = profile.market_cap ?? profile.marketCap;
  return formatPrice(value, result.ticker || profile.ticker, profile.currency) || display(value);
}

function ownershipSourceObjects(profile) {
  return [profile, profile?.shares_ownership, profile?.ownership].filter(
    (source) => source && typeof source === 'object'
  );
}

function firstProfileValue(profile, keys) {
  for (const source of ownershipSourceObjects(profile)) {
    for (const key of keys) {
      if (hasValue(source[key])) return source[key];
    }
  }
  return null;
}

function ownershipRatio(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  const ratio = Math.abs(number) > 1 ? number / 100 : number;
  if (!Number.isFinite(ratio)) return null;
  return Math.max(0, Math.min(ratio, 1));
}

function formatOwnershipPercent(value) {
  const ratio = ownershipRatio(value);
  if (ratio === null) return '-';
  return `${(ratio * 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function profileSharesOutstanding(profile) {
  return firstProfileValue(profile, ['shares_out', 'shares_outstanding', 'sharesOutstanding']);
}

function profileInsiderOwnership(profile) {
  return firstProfileValue(profile, [
    'insider_pct',
    'insider_percent',
    'insider_ownership',
    'heldPercentInsiders',
  ]);
}

function profileInstitutionalOwnership(profile) {
  return firstProfileValue(profile, [
    'institution_pct',
    'institution_percent',
    'institution_ownership',
    'heldPercentInstitutions',
  ]);
}

function profilePublicOwnership(profile) {
  return firstProfileValue(profile, ['public_pct', 'public_percent', 'public_ownership']);
}

function ownershipData(profile) {
  const insider = ownershipRatio(profileInsiderOwnership(profile));
  const institution = ownershipRatio(profileInstitutionalOwnership(profile));
  const explicitPublic = ownershipRatio(profilePublicOwnership(profile));
  const publicOwnership =
    explicitPublic ??
    (insider !== null && institution !== null ? Math.max(0, 1 - insider - institution) : null);

  return { insider, institution, public: publicOwnership };
}

function svgPoint(cx, cy, radius, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function svgNumber(value) {
  return Number(value.toFixed(3));
}

function ownershipSlicePath(startDegrees, endDegrees) {
  const cx = 100;
  const cy = 100;
  const outerRadius = 86;
  const innerRadius = 50;
  const span = endDegrees - startDegrees;

  if (span >= 359.999) {
    return [
      `M ${cx} ${cy - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${cx} ${cy + outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${cx} ${cy - outerRadius}`,
      `M ${cx} ${cy - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy + innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy - innerRadius}`,
      'Z',
    ].join(' ');
  }

  const outerStart = svgPoint(cx, cy, outerRadius, startDegrees);
  const outerEnd = svgPoint(cx, cy, outerRadius, endDegrees);
  const innerEnd = svgPoint(cx, cy, innerRadius, endDegrees);
  const innerStart = svgPoint(cx, cy, innerRadius, startDegrees);
  const largeArc = span > 180 ? 1 : 0;

  return [
    `M ${svgNumber(outerStart.x)} ${svgNumber(outerStart.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${svgNumber(outerEnd.x)} ${svgNumber(outerEnd.y)}`,
    `L ${svgNumber(innerEnd.x)} ${svgNumber(innerEnd.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${svgNumber(innerStart.x)} ${svgNumber(innerStart.y)}`,
    'Z',
  ].join(' ');
}

function ownershipSegments(profile) {
  const ownership = ownershipData(profile);
  const rawSegments = OWNERSHIP_SEGMENTS.map((segment) => ({
    ...segment,
    value: ownership[segment.key],
  }));

  if (rawSegments.some((segment) => segment.value === null)) return [];

  const total = rawSegments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return [];

  let startDegrees = -90;
  return rawSegments.map((segment) => {
    const span = (segment.value / total) * 360;
    const endDegrees = startDegrees + span;
    const item = {
      ...segment,
      display: formatOwnershipPercent(segment.value),
      path: span > 0 ? ownershipSlicePath(startDegrees, endDegrees) : '',
    };
    startDegrees = endDegrees;
    return item;
  });
}

function executiveRows(profile) {
  const rows = Array.isArray(profile?.executives) ? profile.executives : profile?.officers;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (item) => item && typeof item === 'object' && (hasValue(item.name) || hasValue(item.title))
    )
    .slice(0, 10)
    .map((item) => ({ name: display(item.name), title: display(item.title) }));
}

function shareholderRows(profile, result) {
  const rows = Array.isArray(profile?.shareholders) ? profile.shareholders : result?.shareholders;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: display(item.name || item.holder || item.shareholder),
      ownership: formatOwnershipPercent(item.ownership ?? item.percent ?? item.ownership_percent),
      shares: profileNumber(item.shares ?? item.share_count),
      source: display(item.source || item.provider),
    }))
    .filter((item) => item.name !== 'N/A');
}

function businessDescription(profile) {
  return profile.business_summary || profile.description || profile.longBusinessSummary || '';
}

function profileRows(profile, result) {
  const websiteUrl = safeExternalUrl(profile.website);
  return [
    ['Company Name', display(profile.company_name || profile.name)],
    ['Ticker', display(result.normalized_ticker || result.ticker || profile.ticker)],
    ['Currency', display(profile.currency)],
    ['Country', display(profile.country)],
    ['Sector', display(profile.sector)],
    ['Industry', display(profile.industry)],
    ['Market Cap', marketCapDisplay(profile, result)],
    ['Employees', profileNumber(profile.employee_count ?? profile.full_time_employees)],
    [
      'Websites',
      websiteUrl ? (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-bloomberg-orange underline-offset-4 hover:text-orange-300 hover:underline"
        >
          {profile.website}
        </a>
      ) : (
        display(profile.website)
      ),
    ],
  ];
}

function ownershipRows(profile) {
  const publicValue = profilePublicOwnership(profile) ?? ownershipData(profile).public;
  return [
    ['Shares Outstanding', profileNumber(profileSharesOutstanding(profile))],
    ['Insider Ownership', formatOwnershipPercent(profileInsiderOwnership(profile))],
    ['Institutional Ownership', formatOwnershipPercent(profileInstitutionalOwnership(profile))],
    ['Public Ownership', formatOwnershipPercent(publicValue)],
    ['Short Ratio', displayDash(firstProfileValue(profile, ['short_ratio', 'shortRatio']))],
  ];
}

function TerminalSection({ label, children }) {
  return (
    <section className="border-b border-bloomberg-border px-4 py-4">
      <SectionHeader label={label} />
      {children}
    </section>
  );
}

TerminalSection.propTypes = {
  children: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
};

function CompactTable({ columns = null, rows, labelClassName = 'w-40' }) {
  return (
    <div className="overflow-x-auto border border-bloomberg-border bg-black">
      <table className="min-w-full table-fixed font-mono text-xs">
        {columns && (
          <thead>
            <tr className="border-b border-bloomberg-border text-bloomberg-muted">
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left uppercase tracking-wider">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row[0]}-${index}`}
              className="border-b border-bloomberg-border/70 last:border-0"
            >
              {columns ? (
                row.map((cell, cellIndex) => (
                  <td
                    key={`${row[0]}-${cellIndex}`}
                    className="px-3 py-2 align-top text-bloomberg-white"
                  >
                    {cell}
                  </td>
                ))
              ) : (
                <>
                  <th
                    className={`${labelClassName} px-3 py-2 text-left align-top font-semibold uppercase tracking-wider text-bloomberg-muted`}
                  >
                    {row[0]}
                  </th>
                  <td className="px-3 py-2 align-top text-bloomberg-white">{row[1]}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

CompactTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.string),
  labelClassName: PropTypes.string,
  rows: PropTypes.arrayOf(PropTypes.array).isRequired,
};

function OwnershipChart({ profile }) {
  const segments = ownershipSegments(profile);
  if (!segments.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 border border-bloomberg-border bg-bloomberg-surface p-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label="Ownership composition pie chart"
        className="mx-auto h-40 w-40"
      >
        <circle cx="100" cy="100" r="88" fill="#111111" stroke="#242424" strokeWidth="1" />
        {segments.map((segment) => (
          <path
            key={segment.key}
            d={segment.path}
            fill={segment.color}
            stroke="#0a0a0a"
            strokeWidth="2"
            fillRule="evenodd"
          >
            <title>
              {segment.label} {segment.display}
            </title>
          </path>
        ))}
        <circle cx="100" cy="100" r="50" fill="#0a0a0a" stroke="#242424" strokeWidth="1" />
      </svg>

      <div className="grid gap-2 font-mono text-xs">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="grid grid-cols-[14px_minmax(0,1fr)_72px] items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 border border-bloomberg-border"
              style={{ backgroundColor: segment.color }}
            />
            <span className="truncate text-bloomberg-muted">{segment.label}</span>
            <span className="text-right font-semibold text-bloomberg-white">{segment.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

OwnershipChart.propTypes = {
  profile: PropTypes.object.isRequired,
};

export default function ProfileTab({ profile, result = {} }) {
  if (!profile || !profile.available) {
    return (
      <div className="border-b border-bloomberg-border p-4 font-mono">
        <div className="border border-bloomberg-amber bg-bloomberg-amber-dim p-4 text-xs text-bloomberg-amber">
          <div className="mb-2 font-semibold uppercase tracking-widest">PROFILE UNAVAILABLE</div>
          <div>{profile?.warning || 'Company profile data is not available for this ticker.'}</div>
        </div>
      </div>
    );
  }

  const description = businessDescription(profile);
  const executives = executiveRows(profile);
  const shareholders = shareholderRows(profile, result);

  return (
    <div className="font-mono">
      <TerminalSection label="COMPANY PROFILE">
        <CompactTable rows={profileRows(profile, result)} />
      </TerminalSection>

      <TerminalSection label="SHARES & OWNERSHIP">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CompactTable rows={ownershipRows(profile)} />
          <OwnershipChart profile={profile} />
        </div>
      </TerminalSection>

      {description && (
        <TerminalSection label="BUSINESS DESCRIPTION">
          <p className="max-w-none text-justify font-mono text-sm leading-relaxed text-bloomberg-muted">
            {description}
          </p>
        </TerminalSection>
      )}

      {executives.length > 0 && (
        <TerminalSection label="KEY EXECUTIVES">
          <CompactTable
            columns={['Name', 'Title']}
            rows={executives.map((item) => [item.name, item.title])}
          />
        </TerminalSection>
      )}

      {shareholders.length > 0 && (
        <TerminalSection label="SHAREHOLDERS">
          <CompactTable
            columns={['Name', 'Ownership', 'Shares', 'Source']}
            rows={shareholders.map((item) => [item.name, item.ownership, item.shares, item.source])}
          />
        </TerminalSection>
      )}
    </div>
  );
}

ProfileTab.propTypes = {
  profile: PropTypes.object,
  result: PropTypes.object,
};
