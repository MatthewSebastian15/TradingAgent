import PropTypes from 'prop-types';
import { safeExternalUrl } from '../../../utils/url';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function display(value) {
  return value === null || value === undefined || value === '' ? 'N/A' : value;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = numberOrNull(value);
  return number === null ? 'N/A' : number.toLocaleString('en-US');
}

function formatMarketCap(value, currency) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';

  const currencyCode = String(currency || '').toUpperCase();
  if (!currencyCode) return formatNumber(number);

  const isIdr = currencyCode === 'IDR';
  const divisor = isIdr ? 1_000_000_000 : 1_000_000;
  return `${(number / divisor).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${currencyCode} ${isIdr ? 'Bn' : 'Mn'}`;
}

function formatCurrentPrice(value, currency) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';

  const currencyCode = String(currency || '').toUpperCase();
  if (currencyCode === 'IDR') return `Rp ${number.toLocaleString('en-US')}`;
  if (!currencyCode) return formatNumber(number);
  return `${currencyCode} ${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ProfileField({ label, value }) {
  return (
    <div className="border border-bloomberg-border bg-black px-3 py-2">
      <div className="font-mono text-[10px] text-bloomberg-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="font-mono text-xs text-bloomberg-white break-words">{display(value)}</div>
    </div>
  );
}

ProfileField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

export default function ProfileTab({ profile }) {
  if (!profile || !profile.available) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="PROFILE UNAVAILABLE" tone="amber">
          {profile?.warning || 'Company profile data is not available for this ticker.'}
        </NoticeBox>
      </div>
    );
  }

  const officers = Array.isArray(profile.officers)
    ? profile.officers
    : Array.isArray(profile.executives)
      ? profile.executives
      : [];
  const companyName = profile.company_name || profile.name;
  const businessSummary = profile.business_summary || profile.description;
  const employeeCount = profile.employee_count ?? profile.full_time_employees;
  const websiteUrl = safeExternalUrl(profile.website);

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-5">
      <section>
        <SectionHeader label="COMPANY PROFILE" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <ProfileField label="Company Name" value={companyName} />
          <ProfileField label="Ticker" value={profile.ticker} />
          <ProfileField label="Exchange" value={profile.exchange} />
          <ProfileField label="Currency" value={profile.currency} />
          <ProfileField label="Country" value={profile.country} />
          <ProfileField label="Sector" value={profile.sector} />
          <ProfileField label="Industry" value={profile.industry} />
          <ProfileField
            label="Market Cap"
            value={formatMarketCap(profile.market_cap, profile.currency)}
          />
          <ProfileField
            label="Shares Outstanding"
            value={formatNumber(profile.shares_outstanding)}
          />
          <ProfileField
            label="Current Price"
            value={formatCurrentPrice(profile.current_price, profile.currency)}
          />
          <ProfileField label="Fiscal Year End" value={profile.fiscal_year_end} />
          <ProfileField label="Employees" value={formatNumber(employeeCount)} />
          <ProfileField
            label="Website"
            value={
              websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bloomberg-orange hover:text-orange-300"
                >
                  {profile.website}
                </a>
              ) : (
                display(profile.website)
              )
            }
          />
        </div>
        <div className="mt-2 font-mono text-[11px] text-bloomberg-muted">
          Profile data: {profile.data_quality?.status || 'N/A'}
        </div>
      </section>

      <section>
        <SectionHeader label="BUSINESS DESCRIPTION" />
        <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
          {display(businessSummary)}
        </p>
      </section>

      {officers.length > 0 && (
        <section>
          <SectionHeader label="KEY EXECUTIVES" />
          <div className="overflow-x-auto border border-bloomberg-border">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-bloomberg-surface text-bloomberg-muted uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Title</th>
                </tr>
              </thead>
              <tbody>
                {officers.slice(0, 10).map((officer, index) => (
                  <tr
                    key={`${officer.name || 'executive'}-${index}`}
                    className="border-t border-bloomberg-border"
                  >
                    <td className="px-3 py-2 text-bloomberg-white">{officer.name || 'N/A'}</td>
                    <td className="px-3 py-2 text-bloomberg-muted">{officer.title || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

ProfileTab.propTypes = {
  profile: PropTypes.object,
};
