import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';
import { LogIn, Loader2, UserPlus, Key, Shield, Phone, ChevronRight, Trash2, Save } from 'lucide-react';
import api from '../api/axios';

const Login = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'chaoxing'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [useCookies, setUseCookies] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 超星账号相关
  const [cxPhone, setCxPhone] = useState('');
  const [cxPassword, setCxPassword] = useState('');
  const [cxLabel, setCxLabel] = useState('');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showSavedAccounts, setShowSavedAccounts] = useState(false);

  // 本地平台登录
  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { username, password });

      if (response.data.status) {
        // 登录成功后获取已保存的超星账号
        await fetchSavedAccounts(response.data.data.user_id);
        setMode('chaoxing');
      } else {
        setError(response.data.msg || '登录失败');
      }
    } catch (err) {
      setError(err.response?.data?.msg || '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 注册
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/register', {
        username,
        password,
        confirm_password: confirmPassword,
      });

      if (response.data.status) {
        setSuccess('注册成功！请登录');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(response.data.msg || '注册失败');
      }
    } catch (err) {
      setError(err.response?.data?.msg || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 超星登录
  const handleChaoxingLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!cxPhone || !cxPassword) {
      setError('请输入超星手机号和密码');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/login', {
        username: cxPhone,
        password: cxPassword,
        use_cookies: useCookies,
      });

      if (response.data.status) {
        onLoginSuccess({ username: cxPhone, password: cxPassword });
      } else {
        setError(response.data.msg || '超星登录失败');
      }
    } catch (err) {
      setError(err.response?.data?.msg || '超星登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取已保存的超星账号
  const fetchSavedAccounts = async () => {
    try {
      const response = await api.get('/chaoxing-accounts');
      if (response.data.status) {
        setSavedAccounts(response.data.data || []);
      }
    } catch (err) {
      console.error('获取已保存账号失败:', err);
    }
  };

  // 使用已保存的超星账号快速登录
  const handleUseSavedAccount = async (account) => {
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/login', {
        username: account.cx_phone,
        password: account.cx_password || '',
        use_cookies: false,
      });

      if (response.data.status) {
        onLoginSuccess({ username: account.cx_phone, password: account.cx_password || '' });
      } else {
        setError(response.data.msg || '登录失败，请手动输入密码');
        setCxPhone(account.cx_phone);
      }
    } catch (err) {
      setError('登录失败，请手动输入密码');
      setCxPhone(account.cx_phone);
    } finally {
      setLoading(false);
    }
  };

  // 删除已保存的超星账号
  const handleDeleteAccount = async (accountId, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/chaoxing-accounts/${accountId}`);
      setSavedAccounts(prev => prev.filter(a => a.id !== accountId));
    } catch (err) {
      console.error('删除账号失败:', err);
    }
  };

  // 保存当前超星账号
  const handleSaveAccount = async () => {
    if (!cxPhone || !cxPassword) {
      setError('请先填写超星账号信息');
      return;
    }
    try {
      await api.post('/chaoxing-accounts', {
        cx_phone: cxPhone,
        cx_password: cxPassword,
        label: cxLabel,
      });
      fetchSavedAccounts();
      setSuccess('账号已保存');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      console.error('保存账号失败:', err);
    }
  };

  // 切换到超星登录模式时加载已保存账号
  const handleSwitchToChaoxing = () => {
    setMode('chaoxing');
    fetchSavedAccounts();
  };

  // 渲染本地登录/注册表单
  const renderAuthForm = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-center text-3xl">超星学习通</CardTitle>
          <CardDescription className="text-center">
            自动化学习助手 - {mode === 'login' ? '登录' : '注册'}以继续
          </CardDescription>
        </CardHeader>

        <form onSubmit={mode === 'login' ? handleLocalLogin : handleRegister}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">
                <UserPlus className="inline w-4 h-4 mr-1" />
                用户名
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                <Key className="inline w-4 h-4 mr-1" />
                密码
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === 'register' ? '至少6个字符' : '请输入密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="confirm_password">
                  <Key className="inline w-4 h-4 mr-1" />
                  确认密码
                </Label>
                <Input
                  id="confirm_password"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md">
                {success}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'login' ? '登录中...' : '注册中...'}
                </>
              ) : (
                <>
                  {mode === 'login' ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {mode === 'login' ? '登录' : '注册'}
                </>
              )}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              {mode === 'login' ? (
                <>
                  还没有账号？
                  <button
                    type="button"
                    className="text-primary hover:underline ml-1"
                    onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                  >
                    立即注册
                  </button>
                </>
              ) : (
                <>
                  已有账号？
                  <button
                    type="button"
                    className="text-primary hover:underline ml-1"
                    onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                  >
                    立即登录
                  </button>
                </>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );

  // 渲染超星账号登录
  const renderChaoxingLogin = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <Phone className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl">超星账号登录</CardTitle>
          <CardDescription className="text-center">
            输入您的超星学习通账号，或使用已保存的账号
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleChaoxingLogin}>
          <CardContent className="space-y-4">
            {/* 已保存账号 */}
            {savedAccounts.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline flex items-center"
                  onClick={() => setShowSavedAccounts(!showSavedAccounts)}
                >
                  <ChevronRight className={`w-4 h-4 mr-1 transition-transform ${showSavedAccounts ? 'rotate-90' : ''}`} />
                  已保存的账号 ({savedAccounts.length})
                </button>

                {showSavedAccounts && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {savedAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                        onClick={() => handleUseSavedAccount(account)}
                      >
                        <div className="flex items-center space-x-3">
                          <Phone className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{account.cx_phone}</p>
                            {account.label && (
                              <p className="text-xs text-gray-500">{account.label}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-blue-600">点击登录</span>
                          <button
                            type="button"
                            className="p-1 text-gray-400 hover:text-red-500"
                            onClick={(e) => handleDeleteAccount(account.id, e)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cx_phone">超星手机号</Label>
              <Input
                id="cx_phone"
                type="text"
                placeholder="请输入超星学习通手机号"
                value={cxPhone}
                onChange={(e) => setCxPhone(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cx_password">超星密码</Label>
              <Input
                id="cx_password"
                type="password"
                placeholder="请输入超星学习通密码"
                value={cxPassword}
                onChange={(e) => setCxPassword(e.target.value)}
                required={!useCookies}
                disabled={useCookies}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cx_label">账号备注（可选）</Label>
              <Input
                id="cx_label"
                type="text"
                placeholder="例如：主账号、小号"
                value={cxLabel}
                onChange={(e) => setCxLabel(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <input
                  id="use-cookies"
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={useCookies}
                  onChange={(e) => setUseCookies(e.target.checked)}
                />
                <Label htmlFor="use-cookies" className="cursor-pointer text-sm font-normal">
                  使用Cookie登录
                </Label>
              </div>
              <button
                type="button"
                className="text-sm text-primary hover:underline flex items-center"
                onClick={handleSaveAccount}
              >
                <Save className="w-3 h-3 mr-1" />
                保存账号
              </button>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-md">
                {success}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  登录超星
                </>
              )}
            </Button>

            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            >
              返回平台登录
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );

  if (mode === 'chaoxing') {
    return renderChaoxingLogin();
  }

  return renderAuthForm();
};

export default Login;
