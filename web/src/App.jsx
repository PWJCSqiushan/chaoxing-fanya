import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import CourseSelection from './components/CourseSelection';
import StudyProgress from './components/StudyProgress';
import api from './api/axios';

function App() {
  const [step, setStep] = useState('login');
  const [userInfo, setUserInfo] = useState(null);
  const [taskId, setTaskId] = useState(null);

  // 启动时检查会话，如果已登录直接跳转
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get('/auth/session');
        if (response.data.status) {
          // 已登录，检查是否有运行中的任务
          try {
            const tasksRes = await api.get('/tasks/running');
            if (tasksRes.data.status && tasksRes.data.data.length > 0) {
              // 有运行中的任务，直接跳转到进度页
              const runningTask = tasksRes.data.data[0];
              setTaskId(runningTask.task_id);
              // 需要设置userInfo才能进入进度页，但运行中的任务可能没有userInfo
              // 从任务配置中恢复
              setUserInfo({ username: runningTask.current_course || '', password: '' });
              setStep('progress');
              return;
            }
          } catch (err) {
            console.error('检查运行中任务失败:', err);
          }
          // 没有运行中的任务，直接进入超星登录步骤
          setStep('login');
        }
      } catch (err) {
        // 未登录，保持登录页面
      }
    };
    checkSession();
  }, []);

  const handleLoginSuccess = (info) => {
    setUserInfo(info);
    setStep('courses');
  };

  const handleStartStudy = async (settings) => {
    try {
      const response = await api.post('/start', {
        username: userInfo.username,
        password: userInfo.password,
        ...settings,
      });

      if (response.data.status) {
        setTaskId(response.data.data.task_id);
        setStep('progress');
      }
    } catch (err) {
      console.error('启动学习任务失败:', err);
      alert('启动学习任务失败，请重试');
    }
  };

  const handleLogout = () => {
    setUserInfo(null);
    setTaskId(null);
    setStep('login');
    // 同时登出服务端会话
    api.post('/auth/logout').catch(() => {});
  };

  const handleBackToHome = () => {
    setTaskId(null);
    setStep('courses');
  };

  return (
    <div className="App">
      {step === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}
      {step === 'courses' && (
        <CourseSelection
          userInfo={userInfo}
          onStartStudy={handleStartStudy}
          onLogout={handleLogout}
        />
      )}
      {step === 'progress' && taskId && (
        <StudyProgress taskId={taskId} onBack={handleBackToHome} />
      )}
    </div>
  );
}

export default App;
