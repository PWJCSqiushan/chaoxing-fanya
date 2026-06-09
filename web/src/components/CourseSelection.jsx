import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';
import { Play, Loader2, BookOpen, Settings, LogOut, WifiOff, Wifi, Clock, AlertTriangle } from 'lucide-react';
import api from '../api/axios';
import AdvancedSettings from './AdvancedSettings';

const CourseSelection = ({ userInfo, onStartStudy, onLogout }) => {
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [runningTasks, setRunningTasks] = useState([]);
  const [settings, setSettings] = useState({
    speed: 1.0,
    jobs: 4,
    notopen_action: 'retry',
    tiku_config: {},
    notification_config: {},
    ocr_config: {},
  });

  useEffect(() => {
    fetchConfig();
    fetchCourses();
    fetchRunningTasks();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.get('/config');
      if (response.data.status && response.data.data) {
        const cfg = response.data.data;
        if (cfg.settings) {
          setSettings((prev) => ({
            ...prev,
            ...cfg.settings,
          }));
        }
        if (Array.isArray(cfg.selectedCourses)) {
          setSelectedCourses(cfg.selectedCourses);
        }
        if (cfg.offline_mode !== undefined) {
          setOfflineMode(cfg.offline_mode);
        }
      }
    } catch (err) {
      console.error('加载已保存配置失败:', err);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await api.post('/courses', {
        username: userInfo.username,
        password: userInfo.password,
      });

      if (response.data.status) {
        setCourses(response.data.data);
      }
    } catch (err) {
      console.error('获取课程列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRunningTasks = async () => {
    try {
      const response = await api.get('/tasks/running');
      if (response.data.status) {
        setRunningTasks(response.data.data || []);
      }
    } catch (err) {
      console.error('获取运行中任务失败:', err);
    }
  };

  const toggleCourse = (courseId) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleStartStudy = () => {
    onStartStudy({
      ...settings,
      course_list: selectedCourses.length > 0 ? selectedCourses : courses.map(c => c.courseId),
      offline_mode: offlineMode,
    });
  };

  const handleOfflineToggle = () => {
    if (!offlineMode) {
      setShowOfflineConfirm(true);
    } else {
      setOfflineMode(false);
    }
  };

  const confirmOffline = () => {
    setOfflineMode(true);
    setShowOfflineConfirm(false);
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setSaveStatus('');
      const payload = {
        settings,
        selectedCourses,
        offline_mode: offlineMode,
      };
      const response = await api.post('/config', payload);
      if (!response.data.status) {
        console.error('保存配置失败:', response.data.msg);
        setSaveStatus(response.data.msg || '保存失败');
      } else {
        setSaveStatus('保存成功');
      }
    } catch (err) {
      console.error('保存配置请求失败:', err);
      setSaveStatus('保存请求失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">加载课程列表中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">课程管理</h1>
            <p className="text-muted-foreground mt-1">选择要学习的课程并配置学习参数</p>
          </div>
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        </div>

        {/* 运行中任务提示 */}
        {runningTasks.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <Clock className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-700">
                  当前有 {runningTasks.length} 个任务正在运行
                </p>
                <div className="mt-2 space-y-1">
                  {runningTasks.map(task => (
                    <div key={task.task_id} className="text-xs text-blue-600 flex items-center">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      {task.current_course || task.task_id}
                      {task.offline_mode && <WifiOff className="w-3 h-3 ml-1" />}
                      <span className="ml-2">{task.progress}/{task.total} 课程</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 离线模式确认弹窗 */}
        {showOfflineConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-start mb-4">
                <div className="p-2 bg-orange-100 rounded-lg mr-4">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">开启离线刷课模式</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    开启后，即使您关闭浏览器或断开网络，刷课任务仍将在服务器后台继续执行。
                  </p>
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                    <p>请注意：</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>任务将在服务器后台持续运行</li>
                      <li>关闭网页后无法实时查看进度</li>
                      <li>下次打开网页可查看任务结果</li>
                      <li>请确保服务器保持运行状态</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowOfflineConfirm(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmOffline}
                >
                  <WifiOff className="mr-2 h-4 w-4" />
                  确认开启
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BookOpen className="mr-2 h-5 w-5" />
                  课程列表
                </CardTitle>
                <CardDescription>
                  选择要自动学习的课程（不选择将学习所有课程）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {courses.map((course) => (
                    <div
                      key={course.courseId}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedCourses.includes(course.courseId)
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => toggleCourse(course.courseId)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{course.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            课程ID: {course.courseId}
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedCourses.includes(course.courseId)
                            ? 'border-primary bg-primary'
                            : 'border-gray-300'
                        }`}>
                          {selectedCourses.includes(course.courseId) && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 h-5 w-5" />
                  学习配置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="speed">播放倍速</Label>
                  <Input
                    id="speed"
                    type="number"
                    min="1"
                    max="2"
                    step="0.1"
                    value={settings.speed}
                    onChange={(e) => setSettings({ ...settings, speed: parseFloat(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">范围: 1.0 - 2.0</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobs">并发章节数</Label>
                  <Input
                    id="jobs"
                    type="number"
                    min="1"
                    max="10"
                    value={settings.jobs}
                    onChange={(e) => setSettings({ ...settings, jobs: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">同时处理的章节数量</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notopen">未开放章节处理</Label>
                  <select
                    id="notopen"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={settings.notopen_action}
                    onChange={(e) => setSettings({ ...settings, notopen_action: e.target.value })}
                  >
                    <option value="retry">重试</option>
                    <option value="ask">询问</option>
                    <option value="continue">跳过</option>
                  </select>
                </div>

                {/* 离线刷课开关 */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {offlineMode ? (
                        <WifiOff className="h-5 w-5 text-green-600" />
                      ) : (
                        <Wifi className="h-5 w-5 text-gray-400" />
                      )}
                      <div>
                        <Label className="cursor-pointer">离线刷课</Label>
                        <p className="text-xs text-muted-foreground">
                          {offlineMode ? '关闭网页后继续执行' : '关闭网页后任务停止'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOfflineToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        offlineMode ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          offlineMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <AdvancedSettings settings={settings} onChange={setSettings} />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                <Button className="w-full" onClick={handleStartStudy}>
                  <Play className="mr-2 h-4 w-4" />
                  {offlineMode ? '开始离线学习' : '开始学习'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={handleSaveConfig}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存当前配置'}
                </Button>
                {saveStatus && (
                  <p className="text-xs text-muted-foreground text-center">
                    {saveStatus}
                  </p>
                )}
              </CardFooter>
            </Card>

            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">总课程数:</span>
                    <span className="font-semibold">{courses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">已选择:</span>
                    <span className="font-semibold">
                      {selectedCourses.length > 0 ? selectedCourses.length : '全部'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">刷课模式:</span>
                    <span className={`font-semibold ${offlineMode ? 'text-green-600' : 'text-gray-600'}`}>
                      {offlineMode ? '离线模式' : '在线模式'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseSelection;
