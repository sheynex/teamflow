import React from 'react';
import { 
  Settings as SettingsIcon, 
  Building2, 
  Shield, 
  Bell, 
  Palette,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';

export default function Settings() {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);

  const [settings, setSettings] = React.useState({
    orgName: 'TeamFlow Corp',
    orgLogo: '',
    enableTimeTracking: true,
    enableDocuments: true,
    requireTwoFactor: false,
    sessionTimeout: '24h',
    notificationEmail: true,
    notificationPush: true,
  });

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  if (profile?.role !== 'Admin' && profile?.role !== 'Super Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-zinc-500">Only administrators can access system settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-zinc-500 mt-1">Manage your organization's preferences and security.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={18} />
          )}
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-500"
        >
          <CheckCircle2 size={20} />
          <span className="font-medium">Settings updated successfully!</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Navigation Sidebar (Local) */}
        <div className="lg:col-span-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 font-medium text-left">
            <Building2 size={18} />
            <span>General</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left text-zinc-500">
            <Shield size={18} />
            <span>Security</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left text-zinc-500">
            <Bell size={18} />
            <span>Notifications</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left text-zinc-500">
            <Palette size={18} />
            <span>Appearance</span>
          </button>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization Profile */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-emerald-500" />
              Organization Profile
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Organization Name</label>
                <input
                  type="text"
                  value={settings.orgName}
                  onChange={(e) => setSettings({ ...settings, orgName: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Logo URL</label>
                <input
                  type="text"
                  placeholder="https://example.com/logo.png"
                  value={settings.orgLogo}
                  onChange={(e) => setSettings({ ...settings, orgLogo: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Feature Management */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <SettingsIcon size={20} className="text-emerald-500" />
              Feature Management
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Time Tracking</p>
                  <p className="text-sm text-zinc-500">Allow team members to log work hours.</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, enableTimeTracking: !settings.enableTimeTracking })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.enableTimeTracking ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.enableTimeTracking ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="font-medium">Document Management</p>
                  <p className="text-sm text-zinc-500">Enable shared document storage and collaboration.</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, enableDocuments: !settings.enableDocuments })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.enableDocuments ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.enableDocuments ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield size={20} className="text-emerald-500" />
              Security & Access
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-zinc-500">Enforce 2FA for all administrator accounts.</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, requireTwoFactor: !settings.requireTwoFactor })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.requireTwoFactor ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.requireTwoFactor ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Session Timeout</label>
                <select
                  value={settings.sessionTimeout}
                  onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                >
                  <option value="1h">1 Hour</option>
                  <option value="12h">12 Hours</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
