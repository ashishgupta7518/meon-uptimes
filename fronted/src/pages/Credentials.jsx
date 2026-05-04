import { useMemo, useState, useEffect } from 'react';
import {
  getAlertMappings,
  getSmtpCredential,
  getUserEmails,
  saveAlertMappings,
  saveSmtpCredential,
  sendDownAlert,
  testSmtpCredential,
} from '../api/credentials';
import { serviceList } from '../data/services';
import { CheckIcon, MailIcon, PlusIcon, SearchIcon } from '../components/Icons';

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

  const mappingByUrl = useMemo(
    () => new Map(mappings.map((mapping) => [mapping.url, mapping])),
    [mappings]
  );

  const smtpValidationIssues = useMemo(() => getSmtpValidationIssues(smtp), [smtp]);

  const showNotice = (message, type = 'info') => {
    setNotice(message);
    setNoticeType(type);
  };

  useEffect(() => {
    if (noticeType !== 'success') {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setNotice('');
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [noticeType]);

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
          setNotice(error.message);
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
    setNotice('');
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
    setNotice('');
    try {
      const data = await testSmtpCredential(toRecipientList(smtp.defaultRecipients));
      setSmtp((current) => ({
        ...current,
        ...data.credential,
        password: '',
        defaultRecipients: toTextareaValue(data.credential.defaultRecipients),
      }));
      showNotice(data.sent ? 'SMTP verified and test mail sent' : 'SMTP verified', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedService || selectedRecipients.length === 0) {
      setNotice('Select a product and at least one user');
      return;
    }

    setIsSaving(true);
    setNotice('');
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
      showNotice(`${selectedService.name} recipients saved`, 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendDownAlert = async () => {
    setIsSaving(true);
    setNotice('');
    try {
      const data = await sendDownAlert(selectedService.url);
      const result = data.results?.[0];
      if (result?.sent) {
        showNotice(`Alert sent for ${selectedService.name}`, 'success');
      } else {
        showNotice(result?.error || 'Alert request completed', 'error');
      }
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Credentials</h1>
          <p className="mt-1 text-gray-600">Secure SMTP setup and clear product-wise recipient mapping.</p>
        </div>

        <div className="rounded-3xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-lg border border-blue-100">
          {mappings.length} mapped products
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-3xl border px-5 py-4 text-sm font-medium ${
            noticeType === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : noticeType === 'error'
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-blue-100 bg-blue-50 text-blue-700'
          }`}
        >
          {notice}
        </div>
      )}

      <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">SMTP</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Credentials vault</h2>
            <p className="mt-2 text-sm text-gray-500">Hidden by default. Expand only when you need to verify or update sender settings.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <span className={`rounded-full px-4 py-2 text-xs font-semibold ${smtp.hasPassword ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {smtp.hasPassword ? 'Password saved' : 'Password needed'}
            </span>
            <button
              onClick={() => setIsSmtpVisible((current) => !current)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-slate-50"
              type="button"
            >
              {isSmtpVisible ? 'Hide SMTP' : 'Show SMTP'}
            </button>
          </div>
        </div>

        {isSmtpVisible && (
          <div className="mt-6 border-t border-gray-100 pt-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">SMTP Server</span>
                <input
                  value={smtp.host}
                  onChange={(event) => updateSmtp('host', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="smtp.sendgrid.net"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">SMTP Port</span>
                <input
                  value={smtp.port}
                  onChange={(event) => updateSmtp('port', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  inputMode="numeric"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">SMTP Username</span>
                <input
                  value={smtp.username}
                  onChange={(event) => updateSmtp('username', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">SMTP Password</span>
                <div className="mt-2 flex rounded-2xl border border-gray-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    value={smtp.password}
                    onChange={(event) => updateSmtp('password', event.target.value)}
                    className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 text-sm focus:outline-none"
                    placeholder={smtp.hasPassword ? 'Saved password hidden' : 'SMTP password'}
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    onClick={() => setShowPassword((current) => !current)}
                    className="rounded-r-2xl px-4 text-sm font-semibold text-gray-500"
                    type="button"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email From</span>
                <input
                  value={smtp.fromEmail}
                  onChange={(event) => updateSmtp('fromEmail', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  type="email"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Display Name</span>
                <input
                  value={smtp.fromName}
                  onChange={(event) => updateSmtp('fromName', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-gray-700">Default Recipients</span>
                <textarea
                  value={smtp.defaultRecipients}
                  onChange={(event) => updateSmtp('defaultRecipients', event.target.value)}
                  className="mt-2 min-h-24 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="one email per line"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    checked={smtp.useTls}
                    onChange={(event) => updateSmtp('useTls', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    type="checkbox"
                  />
                  SMTP TLS
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    checked={smtp.secure}
                    onChange={(event) => updateSmtp('secure', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    type="checkbox"
                  />
                  Secure socket
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleVerifySmtp}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  <CheckIcon className="h-4 w-4" />
                  Verify
                </button>
                <button
                  onClick={handleSaveSmtp}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  <CheckIcon className="h-4 w-4" />
                  Save SMTP
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Mapping</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">Product-wise recipients</h2>
              <p className="mt-2 text-sm text-gray-500">Choose one product, then assign one or more users who should receive downtime alerts.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSendDownAlert}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                <MailIcon className="h-4 w-4" />
                Send Alert Now
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                <CheckIcon className="h-4 w-4" />
                Save Mapping
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-gray-900">Select Product</span>
                <select
                  value={selectedServiceUrl}
                  onChange={(event) => handleSelectService(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {serviceList.map((service) => (
                    <option key={service.url} value={service.url}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-gray-900">{selectedService?.name}</p>
                <p className="mt-2 break-all text-xs text-gray-500">{selectedService?.url}</p>
                <p className="mt-4 text-sm text-gray-600">
                  {selectedRecipients.length} user{selectedRecipients.length === 1 ? '' : 's'} currently selected for alerts.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="add external email"
                  type="email"
                />
                <button
                  onClick={addManualEmail}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  type="button"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Select Users</p>
                  <p className="text-xs text-gray-500">Showing HRMS users with names and email addresses.</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {isLoading ? 'Loading' : `${displayUsers.length} users`}
                </span>
              </div>

              <div className="mt-4">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Search name or email"
                  type="search"
                />
              </div>

              <div className="mt-4 max-h-[29rem] space-y-3 overflow-y-auto pr-2">
                {displayUsers.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-500">
                    {isLoading ? 'Loading users...' : 'No users loaded from HRMS yet.'}
                  </div>
                )}
                {displayUsers.map((user) => (
                  <label key={user.email} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                    <input
                      checked={selectedRecipients.includes(user.email)}
                      onChange={() => toggleRecipient(user.email)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900">{user.name || user.email}</span>
                      <span className="mt-1 block break-all text-xs text-gray-500">{user.email}</span>
                      {user.designation && <span className="mt-1 block text-xs text-blue-600">{user.designation}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {selectedRecipients.length > 0 && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Selected recipients</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedRecipients.map((email) => (
                  <button
                    key={email}
                    onClick={() => toggleRecipient(email)}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700"
                    type="button"
                  >
                    {email}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Saved mappings</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">Configured products</h2>

          <div className="mt-6 max-h-[35rem] space-y-4 overflow-y-auto pr-2">
            {mappings.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-500">No mappings saved yet.</div>
            )}
            {mappings.map((mapping) => (
              <button
                key={mapping._id || mapping.url}
                onClick={() => handleSelectService(mapping.url)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  mapping.url === selectedServiceUrl
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-slate-50 hover:bg-white'
                }`}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{mapping.serviceName}</p>
                    <p className="mt-1 text-xs text-gray-500">{mapping.recipients?.length || 0} recipients</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${mapping.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {mapping.enabled ? 'On' : 'Off'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(mapping.recipients || []).slice(0, 4).map((email) => (
                    <span key={email} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
                      {email}
                    </span>
                  ))}
                  {(mapping.recipients || []).length > 4 && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500">
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
