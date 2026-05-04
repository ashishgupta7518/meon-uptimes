import { useEffect, useMemo, useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedService = useMemo(
    () => serviceList.find((service) => service.url === selectedServiceUrl) || serviceList[0],
    [selectedServiceUrl]
  );

  const mappingByUrl = useMemo(
    () => new Map(mappings.map((mapping) => [mapping.url, mapping])),
    [mappings]
  );

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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [mappings, searchText, users]);

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const [smtpData, userData, mappingData] = await Promise.all([
          getSmtpCredential(),
          getUserEmails(),
          getAlertMappings(),
        ]);

        setSmtp({
          ...emptySmtp,
          ...(smtpData.credential || {}),
          password: '',
          defaultRecipients: toTextareaValue(smtpData.credential?.defaultRecipients),
        });
        setUsers((userData.users || (userData.emails || []).map(userFromEmail)).map((user) => ({
          name: user.name || user.email,
          email: user.email,
        })));
        const nextMappings = mappingData.mappings || [];
        setMappings(nextMappings);
        setSelectedRecipients(nextMappings.find((mapping) => mapping.url === defaultSelectedServiceUrl)?.recipients || []);
      } catch (error) {
        setNotice(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadCredentials();
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

  const selectAllDisplayedUsers = () => {
    setSelectedRecipients(displayUsers.map((user) => user.email));
  };

  const clearSelectedUsers = () => {
    setSelectedRecipients([]);
  };

  const handleSaveSmtp = async () => {
    if (smtpValidationIssues.length > 0) {
      setNotice(`Cannot save SMTP: ${smtpValidationIssues.join(', ')}`);
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
      setNotice(`SMTP saved in ${data.database}.${data.collection}`);
    } catch (error) {
      setNotice(error.message);
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
      setNotice(data.sent ? 'SMTP verified and test mail sent' : 'SMTP verified');
    } catch (error) {
      setNotice(error.message);
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
      setNotice(`${selectedService.name} recipients saved`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendDownAlert = async () => {
    if (!selectedService) {
      setNotice('Select a service before sending an alert');
      return;
    }

    if (smtpValidationIssues.length > 0) {
      setNotice(`SMTP settings incomplete: ${smtpValidationIssues.join(', ')}`);
      return;
    }

    setIsSaving(true);
    setNotice('');
    try {
      const data = await sendDownAlert(selectedService.url);
      const response = data.results?.[0];
      if (response?.sent) {
        setNotice(`Alert sent for ${selectedService.name}`);
      } else if (response?.error) {
        setNotice(response.error);
      } else {
        setNotice(`Alert request completed for ${selectedService.name}`);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Credentials</h1>
          <p className="mt-1 text-gray-600">SMTP setup and product-wise email recipients.</p>
        </div>
        <div className="rounded-3xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-lg border border-blue-100">
          {mappings.length} mapped products
        </div>
      </div>

      {notice && (
        <div className="rounded-3xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-700">
          {notice}
        </div>
      )}

      <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">SMTP</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Mail server</h2>
          </div>
          <span className={`rounded-full px-4 py-2 text-xs font-semibold ${smtp.hasPassword ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {smtp.hasPassword ? 'Password saved' : 'Password needed'}
          </span>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
              placeholder="apikey"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">SMTP Password</span>
            <input
              value={smtp.password}
              onChange={(event) => updateSmtp('password', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder={smtp.hasPassword ? 'Saved password hidden' : 'SMTP password'}
              type="password"
            />
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
              placeholder="Meon Uptime"
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="text-sm font-medium text-gray-700">Default Email To</span>
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
              className="rounded-2xl border border-emerald-200 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              Verify
            </button>
            <button
              onClick={handleSaveSmtp}
              disabled={isSaving}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              Save SMTP
            </button>
          </div>
        </div>

        {smtpValidationIssues.length > 0 && (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">SMTP settings incomplete</p>
            <p>{smtpValidationIssues.join(', ')}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Recipients</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">Product mail mapping</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSendDownAlert}
                disabled={isSaving}
                className="rounded-2xl border border-emerald-200 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                Send Alert Now
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={isSaving}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                Save Mapping
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
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
                  {selectedRecipients.length} user{selectedRecipients.length === 1 ? '' : 's'} will receive down alerts.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={selectAllDisplayedUsers}
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-slate-50"
                  type="button"
                >
                  Select all shown
                </button>
                <button
                  onClick={clearSelectedUsers}
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-slate-50"
                  type="button"
                >
                  Clear selection
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="add email"
                  type="email"
                />
                <button
                  onClick={addManualEmail}
                  className="rounded-2xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  type="button"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Select Users</p>
                  <p className="text-xs text-gray-500">Search by name or email</p>
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
                  placeholder="Search users"
                  type="search"
                />
              </div>

              <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-2">
                {displayUsers.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-500">No users loaded from API</div>
                )}
                {displayUsers.map((user) => (
                  <label key={user.email} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                    <input
                      checked={selectedRecipients.includes(user.email)}
                      onChange={() => toggleRecipient(user.email)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900">{user.name || user.email}</span>
                      <span className="block break-all text-xs text-gray-500">{user.email}</span>
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
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Saved</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">Product mappings</h2>

          <div className="mt-6 max-h-[34rem] space-y-4 overflow-y-auto pr-2">
            {mappings.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-500">No mappings saved</div>
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
