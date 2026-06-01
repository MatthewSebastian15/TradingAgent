import PropTypes from 'prop-types';
import { safeExternalUrl } from '../../../utils/url';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function ProfileField({ label, value }) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <div className="border border-bloomberg-border bg-black px-3 py-2">
      <div className="font-mono text-[10px] text-bloomberg-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="font-mono text-xs text-bloomberg-white break-words">{value}</div>
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

  const executives = Array.isArray(profile.executives) ? profile.executives : [];
  const websiteUrl = safeExternalUrl(profile.website);

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-5">
      <section>
        <SectionHeader label="COMPANY PROFILE" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <ProfileField label="Company Name" value={profile.name} />
          <ProfileField label="Sector" value={profile.sector} />
          <ProfileField label="Industry" value={profile.industry} />
          <ProfileField
            label="Employees"
            value={
              profile.full_time_employees != null
                ? Number(profile.full_time_employees).toLocaleString()
                : null
            }
          />
          <ProfileField label="Address" value={profile.address} />
          <ProfileField label="Phone" value={profile.phone} />
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
                profile.website
              )
            }
          />
        </div>
      </section>

      {profile.description && (
        <section>
          <SectionHeader label="BUSINESS DESCRIPTION" />
          <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
            {profile.description}
          </p>
        </section>
      )}

      {executives.length > 0 && (
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
                {executives.slice(0, 10).map((executive, index) => (
                  <tr
                    key={`${executive.name || 'executive'}-${index}`}
                    className="border-t border-bloomberg-border"
                  >
                    <td className="px-3 py-2 text-bloomberg-white">{executive.name || 'N/A'}</td>
                    <td className="px-3 py-2 text-bloomberg-muted">{executive.title || 'N/A'}</td>
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
  profile: PropTypes.shape({
    available: PropTypes.bool,
    ticker: PropTypes.string,
    name: PropTypes.string,
    sector: PropTypes.string,
    industry: PropTypes.string,
    address: PropTypes.string,
    phone: PropTypes.string,
    website: PropTypes.string,
    full_time_employees: PropTypes.number,
    description: PropTypes.string,
    executives: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string,
        title: PropTypes.string,
      })
    ),
    warning: PropTypes.string,
  }),
};
