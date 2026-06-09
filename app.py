import os
import sys
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
import threading
import queue
import time
import json
from typing import Dict, List
from datetime import timedelta

# 确定静态文件目录（支持便携版）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
STATIC_DIR = os.path.join(SCRIPT_DIR, "web", "dist")

from api.base import Chaoxing, Account, StudyResult
from api.answer import Tiku
from api.exceptions import LoginError
from api.logger import logger
from api.database import (
    register_user, authenticate_user, change_password,
    save_chaoxing_account, get_chaoxing_accounts, get_chaoxing_account_credentials,
    delete_chaoxing_account, save_task, update_task_status, get_user_tasks,
    get_task_by_task_id, get_running_offline_tasks, cleanup_old_tasks
)
import main as main_module

# 如果存在构建好的前端，则使用静态文件服务
if os.path.exists(STATIC_DIR):
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
else:
    app = Flask(__name__)

app.secret_key = os.environ.get("FLASK_SECRET_KEY", "chaoxing_fanya_secret_key_2024")
CORS(app, supports_credentials=True)

# Web 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "web_config.json")


def load_web_config() -> Dict:
  """加载前端保存的配置"""
  if not os.path.exists(CONFIG_FILE):
      return {}
  try:
      with open(CONFIG_FILE, "r", encoding="utf-8") as f:
          return json.load(f)
  except Exception as e:
      logger.error(f"读取 Web 配置失败: {e}")
      return {}


def save_web_config(data: Dict) -> bool:
  """保存前端配置到本地 JSON 文件"""
  try:
      tmp_path = CONFIG_FILE + ".tmp"
      with open(tmp_path, "w", encoding="utf-8") as f:
          json.dump(data, f, ensure_ascii=False, indent=2)
      os.replace(tmp_path, CONFIG_FILE)
      return True
  except Exception as e:
      logger.error(f"保存 Web 配置失败: {e}")
      return False


# 存储学习任务状态
task_status: Dict[str, dict] = {}
log_queue = queue.Queue()

# 任务详细信息缓存
task_details: Dict[str, dict] = {}

# 在线用户会话（内存缓存，user_id -> session_info）
online_sessions: Dict[int, dict] = {}


class LogCapture:
    """捕获日志输出"""
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.logs = []

    def write(self, message):
        # loguru 传入的是 Message 对象，这里统一转成字符串再处理
        text = str(message).strip()
        if text:
            self.logs.append({
                'time': time.time(),
                'message': text
            })
            log_queue.put({
                'task_id': self.task_id,
                'message': text
            })


# ==================== 用户认证 API ====================

@app.route('/api/register', methods=['POST'])
def api_register():
    """用户注册"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '')
        confirm_password = data.get('confirm_password', '')

        if password != confirm_password:
            return jsonify({'status': False, 'msg': '两次输入的密码不一致'}), 400

        result = register_user(username, password)
        if result['status']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    except Exception as e:
        logger.error(f"注册错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    """本地用户登录（平台账号）"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '')

        result = authenticate_user(username, password)
        if result['status']:
            user_data = result['data']
            # 设置会话
            session['user_id'] = user_data['id']
            session['username'] = user_data['username']
            online_sessions[user_data['id']] = {
                'user_id': user_data['id'],
                'username': user_data['username'],
                'login_time': time.time()
            }
            return jsonify(result)
        else:
            return jsonify(result), 401
    except Exception as e:
        logger.error(f"登录错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def api_auth_logout():
    """本地用户登出"""
    user_id = session.get('user_id')
    if user_id and user_id in online_sessions:
        del online_sessions[user_id]
    session.clear()
    return jsonify({'status': True, 'msg': '已登出'})


@app.route('/api/auth/session', methods=['GET'])
def api_auth_session():
    """检查当前登录会话"""
    user_id = session.get('user_id')
    username = session.get('username')
    if user_id:
        return jsonify({'status': True, 'data': {'user_id': user_id, 'username': username}})
    return jsonify({'status': False, 'msg': '未登录'}), 401


@app.route('/api/auth/change-password', methods=['POST'])
def api_change_password():
    """修改密码"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'status': False, 'msg': '请先登录'}), 401

        data = request.json
        old_password = data.get('old_password', '')
        new_password = data.get('new_password', '')

        result = change_password(user_id, old_password, new_password)
        if result['status']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    except Exception as e:
        logger.error(f"修改密码错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


# ==================== 超星账号管理 API ====================

@app.route('/api/chaoxing-accounts', methods=['GET'])
def api_get_chaoxing_accounts():
    """获取已保存的超星账号列表"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': False, 'msg': '请先登录'}), 401

    result = get_chaoxing_accounts(user_id)
    return jsonify(result)


@app.route('/api/chaoxing-accounts', methods=['POST'])
def api_save_chaoxing_account():
    """保存超星账号"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': False, 'msg': '请先登录'}), 401

    data = request.json
    cx_phone = data.get('cx_phone', '').strip()
    cx_password = data.get('cx_password', '')
    label = data.get('label', '')

    result = save_chaoxing_account(user_id, cx_phone, cx_password, label)
    if result['status']:
        return jsonify(result)
    else:
        return jsonify(result), 400


@app.route('/api/chaoxing-accounts/<int:account_id>', methods=['DELETE'])
def api_delete_chaoxing_account(account_id):
    """删除超星账号"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': False, 'msg': '请先登录'}), 401

    result = delete_chaoxing_account(user_id, account_id)
    return jsonify(result)


# ==================== 超星登录 API ====================

@app.route('/api/login', methods=['POST'])
def login():
    """超星账号登录接口"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        use_cookies = data.get('use_cookies', False)

        if not username or not password:
            return jsonify({'status': False, 'msg': '用户名或密码不能为空'}), 400

        account = Account(username, password)
        tiku = Tiku()
        chaoxing = Chaoxing(account=account, tiku=tiku, query_delay=0)

        login_result = chaoxing.login(login_with_cookies=use_cookies)

        if login_result['status']:
            # 如果本地用户已登录，自动保存超星凭证
            user_id = session.get('user_id')
            if user_id:
                save_chaoxing_account(user_id, username, password)

            return jsonify({
                'status': True,
                'msg': '登录成功',
                'data': {
                    'username': username
                }
            })
        else:
            return jsonify({'status': False, 'msg': login_result['msg']}), 401

    except Exception as e:
        logger.error(f"登录错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500

@app.route('/api/courses', methods=['POST'])
def get_courses():
    """获取课程列表"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        use_cookies = data.get('use_cookies', False)

        account = Account(username, password)
        tiku = Tiku()
        chaoxing = Chaoxing(account=account, tiku=tiku, query_delay=0)

        login_result = chaoxing.login(login_with_cookies=use_cookies)
        if not login_result['status']:
            return jsonify({'status': False, 'msg': '登录失败'}), 401

        courses = chaoxing.get_course_list()

        return jsonify({
            'status': True,
            'data': courses
        })

    except Exception as e:
        logger.error(f"获取课程列表错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/config', methods=['GET', 'POST'])
def web_config():
    if request.method == 'GET':
        data = load_web_config()
        return jsonify({'status': True, 'data': data})

    data = request.json
    if not isinstance(data, dict):
        return jsonify({'status': False, 'msg': '配置格式错误'}), 400

    if not save_web_config(data):
        return jsonify({'status': False, 'msg': '保存失败'}), 500

    return jsonify({'status': True, 'msg': '保存成功'})

@app.route('/api/start', methods=['POST'])
def start_study():
    """开始学习任务"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        course_list = data.get('course_list', [])
        speed = float(data.get('speed', 1.0))
        jobs = int(data.get('jobs', 4))
        notopen_action = data.get('notopen_action', 'retry')
        tiku_config = data.get('tiku_config', {})
        notification_config = data.get('notification_config', {})
        ocr_config = data.get('ocr_config', {})
        offline_mode = data.get('offline_mode', False)

        # 设置 OCR 配置环境变量
        if ocr_config.get('provider') and ocr_config.get('key'):
            os.environ['CHAOXING_VISION_OCR_PROVIDER'] = ocr_config['provider']
            os.environ['CHAOXING_VISION_OCR_KEY'] = ocr_config['key']
            if ocr_config.get('endpoint'):
                os.environ['CHAOXING_VISION_OCR_ENDPOINT'] = ocr_config['endpoint']
            if ocr_config.get('model'):
                os.environ['CHAOXING_VISION_OCR_MODEL'] = ocr_config['model']
            # 重置 vision_ocr 模块的配置缓存，使新配置生效
            try:
                from api.vision_ocr import reset_vision_ocr_config
                reset_vision_ocr_config()
            except ImportError:
                pass
            logger.info(f"已配置外部 AI 视觉 OCR: provider={ocr_config['provider']}")

        # 创建任务ID
        task_id = f"{username}_{int(time.time())}"

        # 初始化任务状态
        task_status[task_id] = {
            'status': 'running',
            'progress': 0,
            'total': 0,
            'current_course': '',
            'current_chapter': '',
            'current_task': '',
            'logs': [],
            'start_time': time.time(),
            'offline_mode': offline_mode,
            'stats': {
                'total_chapters': 0,
                'completed_chapters': 0,
                'total_tasks': 0,
                'completed_tasks': 0,
                'failed_tasks': 0,
                'skipped_tasks': 0
            }
        }

        # 初始化任务详细信息
        task_details[task_id] = {
            'courses': [],  # 存储每个课程的详细信息
            'active_jobs': {}  # 存储活跃的视频任务进度
        }

        # 保存任务到数据库（支持离线模式）
        user_id = session.get('user_id')
        if user_id:
            save_task(user_id, task_id, {
                'username': username,
                'course_list': course_list,
                'speed': speed,
                'jobs': jobs,
                'notopen_action': notopen_action,
            }, offline_mode=offline_mode)

        # 构建配置
        common_config = {
            'username': username,
            'password': password,
            'course_list': course_list,
            'speed': min(2.0, max(1.0, speed)),
            'jobs': jobs,
            'notopen_action': notopen_action,
            'use_cookies': False
        }

        # 在后台线程中运行学习任务
        def run_task():
            from api.notification import Notification
            import traceback

            notification = None
            # 为当前任务注册日志捕获，将 loguru 日志通过 LogCapture 推送到前端
            capture = LogCapture(task_id)
            log_sink_id = logger.add(capture.write, enqueue=True)

            def update_video_progress(course, job, current_time, duration):
                """更新视频播放进度"""
                try:
                    if task_id in task_details:
                        task_details[task_id]['active_jobs'][job['jobid']] = {
                            'course_name': course['title'],
                            'job_name': job.get('name', '未知任务'),
                            'current_time': current_time,
                            'duration': duration,
                            'progress': (current_time / duration * 100) if duration > 0 else 0,
                            'timestamp': time.time()
                        }

                        # 清理太久没有更新的任务（例如已完成或异常退出的）
                        current_ts = time.time()
                        expired_jobs = []
                        for jid, info in task_details[task_id]['active_jobs'].items():
                            if current_ts - info['timestamp'] > 10:  # 10秒无更新视为非活跃
                                expired_jobs.append(jid)
                        for jid in expired_jobs:
                            task_details[task_id]['active_jobs'].pop(jid, None)
                except Exception:
                    pass

            try:
                # 初始化超星实例
                chaoxing = main_module.init_chaoxing(common_config, tiku_config)

                # 注入回调
                common_config['video_progress_callback'] = update_video_progress
                login_result = chaoxing.login(login_with_cookies=False)

                if not login_result['status']:
                    task_status[task_id]['status'] = 'error'
                    task_status[task_id]['error'] = '登录失败'
                    update_task_status(task_id, 'error')
                    return

                # 设置外部通知
                notification = Notification()
                notification.config_set(notification_config)
                notification = notification.get_notification_from_config()
                notification.init_notification()

                all_courses = chaoxing.get_course_list()
                course_task = main_module.filter_courses(all_courses, course_list)

                task_status[task_id]['total'] = len(course_task)

                # 初始化课程详情
                for course in course_task:
                    task_details[task_id]['courses'].append({
                        'id': course['courseId'],
                        'title': course['title'],
                        'status': 'pending',
                        'chapters': [],
                        'start_time': None,
                        'end_time': None
                    })

                # 为 main.process_course 配置章节开始/完成的回调，用于实时更新章节与任务统计
                def chapter_start_callback(course_obj, point_obj):
                    try:
                        # 更新当前课程与章节名称，便于前端展示"正在学习"信息
                        task_status[task_id]['current_course'] = course_obj.get('title', task_status[task_id].get('current_course', ''))
                        task_status[task_id]['current_chapter'] = point_obj.get('title', '')
                    except Exception as e:
                        logger.debug(f"更新当前章节状态失败: {e}")

                def chapter_done_callback(course_obj, point_obj):
                    try:
                        if task_id not in task_status or task_id not in task_details:
                            return

                        stats = task_status[task_id]['stats']
                        courses_detail = task_details[task_id]['courses']
                        course_id = course_obj.get('courseId')

                        target_course = None
                        for c in courses_detail:
                            if c.get('id') == course_id:
                                target_course = c
                                break

                        if not target_course:
                            return

                        chapters = target_course.get('chapters', [])
                        for chapter in chapters:
                            if chapter.get('id') == point_obj.get('id'):
                                if not chapter.get('has_finished'):
                                    chapter['has_finished'] = True
                                    chapter['status'] = 'completed'
                                    try:
                                        job_count = int(chapter.get('jobCount', 1) or 1)
                                    except (TypeError, ValueError):
                                        job_count = 1
                                    stats['completed_chapters'] += 1
                                    stats['completed_tasks'] += job_count
                                else:
                                    # 已完成章节统一标记为 completed
                                    chapter['status'] = 'completed'
                                break
                    except Exception as e:
                        logger.debug(f"更新章节统计失败: {e}")

                # 将回调注入 common_config，供 main.process_course / process_chapter 使用
                common_config['chapter_start_callback'] = chapter_start_callback
                common_config['chapter_done_callback'] = chapter_done_callback

                for idx, course in enumerate(course_task):
                    course_detail = task_details[task_id]['courses'][idx]
                    course_detail['status'] = 'running'
                    course_detail['start_time'] = time.time()

                    task_status[task_id]['current_course'] = course['title']
                    task_status[task_id]['progress'] = idx

                    # 获取章节信息并处理
                    try:
                        point_list = chaoxing.get_course_point(
                            course['courseId'], course['clazzId'], course['cpi']
                        )

                        points = point_list.get('points', [])
                        stats = task_status[task_id]['stats']

                        # 统计总章节数
                        stats['total_chapters'] += len(points)

                        # 记录章节信息与任务数量
                        for point in points:
                            has_finished = point.get('has_finished', False)
                            # jobCount 来自 decode_course_point，表示章节内任务数量，缺失时按 1 计
                            try:
                                job_count = int(point.get('jobCount', 1) or 1)
                            except (TypeError, ValueError):
                                job_count = 1

                            chapter_info = {
                                'id': point.get('id'),
                                'title': point.get('title', ''),
                                'status': 'completed' if has_finished else 'pending',
                                'has_finished': has_finished,
                                'jobCount': job_count,
                            }
                            course_detail['chapters'].append(chapter_info)

                            # 累计任务统计
                            stats['total_tasks'] += job_count
                            if has_finished:
                                stats['completed_chapters'] += 1
                                stats['completed_tasks'] += job_count

                        # 处理课程（原有逻辑，但章节/任务统计通过回调实时更新）
                        main_module.process_course(chaoxing, course, common_config)

                        # 课程处理完成后，确保已完成的章节状态为 completed（统计已在回调中完成）
                        for chapter in course_detail['chapters']:
                            if chapter.get('has_finished'):
                                chapter['status'] = 'completed'

                        course_detail['status'] = 'completed'
                        course_detail['end_time'] = time.time()

                    except Exception as course_error:
                        logger.error(f"课程处理失败 {course['title']}: {course_error}")
                        course_detail['status'] = 'error'
                        course_detail['error'] = str(course_error)
                        course_detail['end_time'] = time.time()

                    task_status[task_id]['progress'] = idx + 1

                task_status[task_id]['status'] = 'completed'
                update_task_status(task_id, 'completed')

                # 发送完成通知
                if notification:
                    notification.send("超星学习通: 所有课程学习任务已完成")

            except Exception as e:
                logger.error(f"任务执行错误: {e}")
                task_status[task_id]['status'] = 'error'
                task_status[task_id]['error'] = str(e)
                update_task_status(task_id, 'error')

                # 发送错误通知
                if notification:
                    try:
                        notification.send(f"超星学习通: 出现错误 {type(e).__name__}: {e}\n{traceback.format_exc()}")
                    except Exception:
                        pass
            finally:
                # 无论任务成功或失败，都移除当前任务的日志捕获 sink
                try:
                    logger.remove(log_sink_id)
                except Exception:
                    pass

        thread = threading.Thread(target=run_task, daemon=False)
        thread.start()

        if offline_mode:
            logger.info(f"离线刷课任务已启动: {task_id} (关闭网页后任务将继续在后台执行)")

        return jsonify({
            'status': True,
            'data': {
                'task_id': task_id
            }
        })

    except Exception as e:
        logger.error(f"启动任务错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500

# ==================== 任务管理 API ====================

@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取任务状态"""
    if task_id not in task_status:
        # 尝试从数据库查找
        db_task = get_task_by_task_id(task_id)
        if db_task['status']:
            return jsonify({
                'status': True,
                'data': {
                    'status': db_task['data']['status'],
                    'offline_mode': db_task['data']['offline_mode'],
                    'created_at': db_task['data']['created_at'],
                }
            })
        return jsonify({'status': False, 'msg': '任务不存在'}), 404

    return jsonify({
        'status': True,
        'data': task_status[task_id]
    })

@app.route('/api/task/<task_id>/details', methods=['GET'])
def get_task_details(task_id):
    """获取任务详细信息"""
    if task_id not in task_details:
        return jsonify({'status': False, 'msg': '任务详情不存在'}), 404

    return jsonify({
        'status': True,
        'data': task_details[task_id]
    })

@app.route('/api/tasks', methods=['GET'])
def api_get_tasks():
    """获取当前用户的所有任务"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': False, 'msg': '请先登录'}), 401

    result = get_user_tasks(user_id)
    # 补充内存中的实时状态
    for task in result.get('data', []):
        tid = task['task_id']
        if tid in task_status:
            task['realtime_status'] = task_status[tid]['status']
            task['progress'] = task_status[tid].get('progress', 0)
            task['total'] = task_status[tid].get('total', 0)
            task['stats'] = task_status[tid].get('stats', {})
            task['current_course'] = task_status[tid].get('current_course', '')
        else:
            task['realtime_status'] = task.get('status', 'unknown')

    return jsonify(result)

@app.route('/api/tasks/running', methods=['GET'])
def api_get_running_tasks():
    """获取当前正在运行的任务"""
    running = []
    for tid, status in task_status.items():
        if status.get('status') == 'running':
            running.append({
                'task_id': tid,
                'current_course': status.get('current_course', ''),
                'progress': status.get('progress', 0),
                'total': status.get('total', 0),
                'stats': status.get('stats', {}),
                'offline_mode': status.get('offline_mode', False),
                'start_time': status.get('start_time'),
            })

    return jsonify({'status': True, 'data': running})


@app.route('/api/logs/<task_id>', methods=['GET'])
def get_logs(task_id):
    """获取任务日志"""
    logs = []
    while not log_queue.empty():
        log_entry = log_queue.get()
        if log_entry['task_id'] == task_id:
            # 分析日志级别
            message = log_entry['message']
            level = 'info'
            if 'ERROR' in message.upper() or '错误' in message or '失败' in message:
                level = 'error'
            elif 'WARNING' in message.upper() or '警告' in message:
                level = 'warning'
            elif 'SUCCESS' in message.upper() or '成功' in message or '完成' in message:
                level = 'success'
            elif '开始' in message or '正在' in message:
                level = 'info'

            logs.append({
                'message': message,
                'level': level,
                'timestamp': time.time()
            })

    return jsonify({
        'status': True,
        'data': logs
    })

@app.route('/api/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': True, 'msg': 'OK'})


# ==================== 静态文件服务（便携版支持） ====================

@app.route('/')
def serve_index():
    """服务前端首页"""
    if os.path.exists(STATIC_DIR):
        return send_from_directory(STATIC_DIR, 'index.html')
    return jsonify({'status': False, 'msg': '前端未构建，请访问 http://localhost:5173 使用开发模式'}), 404


@app.route('/<path:path>')
def serve_static(path):
    """服务静态文件，支持 SPA 客户端路由"""
    if os.path.exists(STATIC_DIR):
        # 如果请求的是 API 路径，跳过（已被上面的路由处理）
        if path.startswith('api/'):
            return jsonify({'status': False, 'msg': 'Not Found'}), 404

        # 尝试提供静态文件
        file_path = os.path.join(STATIC_DIR, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(STATIC_DIR, path)

        # 对于 SPA 客户端路由，返回 index.html
        return send_from_directory(STATIC_DIR, 'index.html')

    return jsonify({'status': False, 'msg': '前端未构建'}), 404


if __name__ == "__main__":
    # 启动时清理旧任务
    try:
        cleaned = cleanup_old_tasks(30)
        if cleaned > 0:
            logger.info(f"已清理 {cleaned} 条超过30天的旧任务记录")
    except Exception as e:
        logger.warning(f"清理旧任务失败: {e}")

    # 检测是否存在前端构建
    if os.path.exists(STATIC_DIR):
        logger.info(f"检测到前端构建，将提供静态文件服务: {STATIC_DIR}")
        logger.info("请在浏览器中打开: http://localhost:5000")
    else:
        logger.info("未检测到前端构建，仅提供 API 服务")
        logger.info("前端开发模式请访问: http://localhost:5173")

    # use_reloader=False 避免热重载导致后台线程 ThreadPoolExecutor 崩溃
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
