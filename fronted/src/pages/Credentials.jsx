import { useEffect, useMemo, useState } from 'react';
import Tooltip from '../components/Tooltip';
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  PlusIcon,
  SearchIcon,
} from '../components/Icons';
import {
  getAlertMappings,
  getSmtpCredential,
  getUserEmails,
  saveAlertMappings,
  saveSmtpCredential,
  testSmtpCredential,
} from '../api/credentials';
import { serviceList } from '../data/services';

const emptySmtp = {
  host: '',
  port: 587,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  useTls: true,
  secure: false,
  defaultRecipients: '',
  hasPassword: false,
};

const defaultSelectedServiceUrl = serviceList[0]?.url || '';

const toTextareaValue = (value) => (Array.isArray(value) ? value.join('\n') : value || '');
const toRecipientList = (value) =>
  String(value || '')
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const userFromEmail = (email) => ({ name: email, email });

const getSmtpValidationIssues = (smtp) => {
  const issues = [];
  if (!smtp.host?.trim()) issues.push('SMTP host');
  if (!smtp.port) issues.push('SMTP port');
  if (!smtp.username?.trim()) issues.push('SMTP username');
  if (!smtp.fromEmail?.trim()) issues.push('From email');
  if (!smtp.hasPassword && !smtp.password?.trim()) issues.push('SMTP password');
  return issues;
};

const inputLabelClass = 'mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500';

const Credentials = () => {
  const [smtp, setSmtp] = useState(emptySmtp);
  const [users, setUsers] = useState([]);
  const [manualEmail, setManualEmail] = useState('');
  const [selectedServiceUrl, setSelectedServiceUrl] = useState(defaultSelectedServiceUrl);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [mappings, setMappings] = useState([]);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSmtpVisible, setIsSmtpVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const selectedService = useMemo(
    () => serviceList.find((service) => service.url === selectedServiceUrl) || serviceList[0],
    [selectedServiceUrl]
  );

  const mappingByUrl = useMemo(() => new Map(mappings.map((mapping) => [mapping.url, mapping])), [mappings]);
  const smtpValidationIssues = useMemo(() => getSmtpValidationIssues(smtp), [smtp]);

  const displayUsers = useMemo(() => {
    const mappedUsers = mappings.flatMap((mapping) => (mapping.recipients || []).map(userFromEmail));
    return [...new Map([...users, ...mappedUsers].map((user) => [user.email, user])).values()]
      .filter((user) => user.email)
      .filter((user) => {
        if (!searchText.trim()) {
          return true;
        }
        const query = searchText.trim().toLowerCase();
        return user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [mappings, searchText, users]);

  const showNotice = (message, type = 'info') => {
    setNotice(message);
    setNoticeType(type);
  };

  useEffect(() => {
    if (noticeType !== 'success') {
      return undefined;
    }

    const timeoutId = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timeoutId);
  }, [noticeType]);

  useEffect(() => {
    let ignore = false;

    const loadCredentials = async () => {
      try {
        const [smtpData, userData, mappingData] = await Promise.all([
          getSmtpCredential(),
          getUserEmails(),
          getAlertMappings(),
        ]);

        if (!ignore) {
          setSmtp({
            ...emptySmtp,
            ...(smtpData.credential || {}),
            password: '',
            defaultRecipients: toTextareaValue(smtpData.credential?.defaultRecipients),
          });
          setUsers((userData.users || (userData.emails || []).map(userFromEmail)).map((user) => ({
            name: user.name || user.email,
            email: user.email,
            designation: user.designation || '',
          })));
          const nextMappings = mappingData.mappings || [];
          setMappings(nextMappings);
          setSelectedRecipients(nextMappings.find((mapping) => mapping.url === defaultSelectedServiceUrl)?.recipients || []);
        }
      } catch (error) {
        if (!ignore) {
          showNotice(error.message, 'error');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadCredentials();
    return () => {
      ignore = true;
    };
  }, []);

  const updateSmtp = (field, value) => {
    setSmtp((current) => ({ ...current, [field]: value }));
  };

  const handleSelectService = (url) => {
    setSelectedServiceUrl(url);
    setSelectedRecipients(mappingByUrl.get(url)?.recipients || []);
  };

  const toggleRecipient = (email) => {
    setSelectedRecipients((current) =>
      current.includes(email) ? current.filter((item) => item !== email) : [...current, email]
    );
  };

  const addManualEmail = () => {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return;
    }
    setUsers((current) => [...new Map([...current, userFromEmail(email)].map((user) => [user.email, user])).values()]);
    setSelectedRecipients((current) => [...new Set([...current, email])]);
    setManualEmail('');
  };

  const handleSaveSmtp = async () => {
    if (smtpValidationIssues.length > 0) {
      showNotice(`Cannot save SMTP: ${smtpValidationIssues.join(', ')}`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const data = await saveSmtpCredential({
        ...smtp,
        port: Number(smtp.port),
        defaultRecipients: toRecipientList(smtp.defaultRecipients),
      });
      setSmtp({
        ...emptySmtp,
        ...data.credential,
        password: '',
        defaultRecipients: toTextareaValue(data.credential.defaultRecipients),
      });
      showNotice(`SMTP saved in ${data.database}.${data.collection}`, 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifySmtp = async () => {
    setIsSaving(true);
    try {
      const data = await testSmtpCredential(toRecipientList(smtp.defaultRecipients));
      setSmtp((current) => ({
        ...current,
        ...data.credential,
        password: '',
        defaultRecipients: toTextareaValue(data.credential.defaultRecipients),
      }));
      showNotice(data.sent ? 'SMTP verified and test mail sent.' : 'SMTP verified.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedService || selectedRecipients.length === 0) {
      showNotice('Select a product and at least one recipient.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const data = await saveAlertMappings([
        {
          serviceName: selectedService.name,
          url: selectedService.url,
          recipients: selectedRecipients,
          enabled: true,
        },
      ]);
      setMappings(data.mappings || []);
      showNotice(`${selectedService.name} recipients saved.`, 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Mail Suite</p>
          <h1 className="mt-2">Credentials</h1>
          <p className="page-copy mt-2 max-w-2xl">
            Store SMTP credentials securely, choose a product, and map multiple users who should receive downtime alerts.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-card bg-gradient-to-br from-[#eef3ff] to-white px-5 py-4">
            <p className="text-sm font-semibold text-slate-600">Mapped products</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{mappings.length}</p>
          </div>
          <div className="surface-card bg-gradient-to-br from-[#f8f2ff] to-white px-5 py-4">
            <p className="text-sm font-semibold text-slate-600">Recipients selected</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{selectedRecipients.length}</p>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`surface-card px-4 py-3 text-sm font-medium ${
            noticeType === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : noticeType === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-sky-100 bg-sky-50 text-sky-700'
          }`}
        >
          {notice}
        </div>
      )}

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-kicker">SMTP</p>
            <h2 className="mt-2">Sender configuration</h2>
            <p className="page-copy mt-2 max-w-2xl">
              Keep credentials hidden by default. Open this section when you want to verify mail delivery or update sender details.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                smtp.hasPassword ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {smtp.hasPassword ? 'Password saved' : 'Password required'}
            </span>
            <Tooltip >
              <button
                onClick={() => setIsSmtpVisible((current) => !current)}
                className="soft-button px-4 py-2.5 text-sm"
                type="button"
              >
                {isSmtpVisible ? 'Hide SMTP' : 'Show SMTP'}
              </button>
            </Tooltip>
          </div>
        </div>

        {isSmtpVisible && (
          <div className="space-y-5 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label>
                <span className={inputLabelClass}>
                  SMTP server
                  <Tooltip >
                    <InfoIcon className="h-4 w-4 text-slate-400" />
                  </Tooltip>
                </span>
                <input value={smtp.host} onChange={(event) => updateSmtp('host', event.target.value)} className="field-control" placeholder="smtp.sendgrid.net" />
              </label>

              <label>
                <span className={inputLabelClass}>SMTP port</span>
                <input value={smtp.port} onChange={(event) => updateSmtp('port', event.target.value)} className="field-control" inputMode="numeric" />
              </label>

              <label>
                <span className={inputLabelClass}>SMTP username</span>
                <input value={smtp.username} onChange={(event) => updateSmtp('username', event.target.value)} className="field-control" />
              </label>

              <label className="md:col-span-2 xl:col-span-1">
                <span className={inputLabelClass}>SMTP password</span>
                <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-[#2f57c8] focus-within:ring-4 focus-within:ring-[#2f57c8]/10">
                  <input
                    value={smtp.password}
                    onChange={(event) => updateSmtp('password', event.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-900 focus:outline-none"
                    placeholder={smtp.hasPassword ? 'Saved password hidden' : 'SMTP password'}
                    type={showPassword ? 'text' : 'password'}
                  />
                  <Tooltip content={showPassword ? 'Hide password' : 'Show password'}>
                    <button
                      onClick={() => setShowPassword((current) => !current)}
                      className="border-l border-slate-200 px-4 text-slate-500"
                      type="button"
                    >
                      {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </Tooltip>
                </div>
              </label>

              <label>
                <span className={inputLabelClass}>Email from</span>
                <input value={smtp.fromEmail} onChange={(event) => updateSmtp('fromEmail', event.target.value)} className="field-control" type="email" />
              </label>

              <label>
                <span className={inputLabelClass}>Display name</span>
                <input value={smtp.fromName} onChange={(event) => updateSmtp('fromName', event.target.value)} className="field-control" />
              </label>
            </div>

            <label className="block">
              <span className={inputLabelClass}>
                Default recipients
                <Tooltip >
                  <InfoIcon className="h-4 w-4 text-slate-400" />
                </Tooltip>
              </span>
              <textarea
                value={smtp.defaultRecipients}
                onChange={(event) => updateSmtp('defaultRecipients', event.target.value)}
                className="field-control min-h-[120px]"
                placeholder="one email per line"
              />
            </label>

            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    checked={smtp.useTls}
                    onChange={(event) => updateSmtp('useTls', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#2f57c8] focus:ring-[#2f57c8]"
                    type="checkbox"
                  />
                  SMTP TLS
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    checked={smtp.secure}
                    onChange={(event) => updateSmtp('secure', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#2f57c8] focus:ring-[#2f57c8]"
                    type="checkbox"
                  />
                  Secure socket
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <Tooltip >
                  <button
                    onClick={handleVerifySmtp}
                    disabled={isSaving}
                    className="soft-button inline-flex items-center gap-2 px-4 py-3 text-sm text-emerald-700"
                    type="button"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Verify SMTP
                  </button>
                </Tooltip>
                <Tooltip >
                  <button
                    onClick={handleSaveSmtp}
                    disabled={isSaving}
                    className="brand-button inline-flex items-center gap-2 px-5 py-3 text-sm"
                    type="button"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Save SMTP
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_0.9fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-kicker">Mapping</p>
              <h2 className="mt-2">Product-wise recipients</h2>
              <p className="page-copy mt-2 max-w-2xl">
                Select one product first, then choose multiple users who should receive downtime notifications for that product.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Tooltip >
                <button
                  onClick={handleSaveMapping}
                  disabled={isSaving}
                  className="brand-button inline-flex items-center gap-2 px-5 py-3 text-sm"
                  type="button"
                >
                  <CheckIcon className="h-4 w-4" />
                  Save mapping
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="grid gap-5 px-5 py-5 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-4">
              <label>
                <span className={inputLabelClass}>Select product</span>
                <select value={selectedServiceUrl} onChange={(event) => handleSelectService(event.target.value)} className="field-control">
                  {serviceList.map((service) => (
                    <option key={service.url} value={service.url}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="surface-muted bg-gradient-to-br from-[#eef3ff] to-[#fbecf2] p-4">
                <p className="text-sm font-semibold text-slate-900">{selectedService?.name}</p>
                <p className="mt-2 break-all text-xs text-slate-500">{selectedService?.url}</p>
                <p className="mt-4 text-sm text-slate-600">
                  {selectedRecipients.length} recipient{selectedRecipients.length === 1 ? '' : 's'} selected for this product.
                </p>
              </div>

              <div className="space-y-3">
                <label>
                  <span className={inputLabelClass}>Add external email</span>
                  <div className="flex gap-2">
                    <input
                      value={manualEmail}
                      onChange={(event) => setManualEmail(event.target.value)}
                      className="field-control min-w-0"
                      placeholder="vendor@example.com"
                      type="email"
                    />
                    <button onClick={addManualEmail} className="soft-button inline-flex items-center gap-2 px-4 py-3 text-sm" type="button">
                      <PlusIcon className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                </label>
              </div>

              {selectedRecipients.length > 0 && (
                <div className="surface-muted bg-[#eef3ff] p-4">
                  <p className="text-sm font-semibold text-slate-900">Selected recipients</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRecipients.map((email) => (
                      <button
                        key={email}
                        onClick={() => toggleRecipient(email)}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#2f57c8] shadow-sm"
                        type="button"
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Select users</p>
                  <p className="mt-1 text-xs text-slate-500">HRMS users are shown with name and email.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                  {isLoading ? 'Loading' : `${displayUsers.length} users`}
                </span>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="field-control pl-11"
                  placeholder="Search name or email"
                  type="search"
                />
              </div>

              <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                {displayUsers.length === 0 && (
                  <div className="surface-muted px-4 py-4 text-sm text-slate-500">
                    {isLoading ? 'Loading users...' : 'No users found for the current search.'}
                  </div>
                )}

                {displayUsers.map((user) => (
                  <label key={user.email} className="surface-muted flex items-start gap-3 bg-white p-4">
                    <input
                      checked={selectedRecipients.includes(user.email)}
                      onChange={() => toggleRecipient(user.email)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#2f57c8] focus:ring-[#2f57c8]"
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{user.name || user.email}</span>
                      <span className="mt-1 block break-all text-xs text-slate-500">{user.email}</span>
                      {user.designation && <span className="mt-1 block text-xs font-medium text-[#2f57c8]">{user.designation}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-5">
            <p className="section-kicker">Saved mappings</p>
            <h2 className="mt-2">Configured products</h2>
            <p className="page-copy mt-2">Pick a saved product to review or update its recipients.</p>
          </div>

          <div className="max-h-[40rem] space-y-3 overflow-y-auto px-5 py-5">
            {mappings.length === 0 && (
              <div className="surface-muted px-4 py-4 text-sm text-slate-500">No mappings saved yet.</div>
            )}

            {mappings.map((mapping) => (
              <button
                key={mapping._id || mapping.url}
                onClick={() => handleSelectService(mapping.url)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  mapping.url === selectedServiceUrl
                    ? 'border-[#c6d4fb] bg-[#eef3ff]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{mapping.serviceName}</p>
                    <p className="mt-1 text-xs text-slate-500">{mapping.recipients?.length || 0} recipients</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      mapping.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {mapping.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(mapping.recipients || []).slice(0, 4).map((email) => (
                    <span key={email} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {email}
                    </span>
                  ))}
                  {(mapping.recipients || []).length > 4 && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                      +{mapping.recipients.length - 4}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Credentials;
