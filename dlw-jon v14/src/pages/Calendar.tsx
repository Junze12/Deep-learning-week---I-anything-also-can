import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Clock, AlignLeft, Bell, Sparkles } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  addDays
} from 'date-fns';

interface CalendarEvent {
  id: number;
  event_date: string;
  event_time: string;
  event_type?: string | null;
  title?: string | null;
  remarks?: string;
  subject_name: string;
  topic_name?: string;
  topic_id?: number | null;
}

interface Subject {
  id: number;
  subject_name: string;
}

interface Topic {
  id: number;
  topic_name: string;
  description?: string | null;
  goal?: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Suggestion {
  subject_name: string;
  topic_name?: string | null;
  event_date: string;
  event_time: string;
  remarks?: string;
  title?: string | null;
  event_type?: string | null;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'kanban'>('calendar');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState<CalendarEvent | null>(null);
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[]>([]);
  const [selectedSubjectForAI, setSelectedSubjectForAI] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [eventTime, setEventTime] = useState('09:00');
  const [remarks, setRemarks] = useState('');
  const [eventType, setEventType] = useState('study');
  const [eventTitle, setEventTitle] = useState('');

  const token = localStorage.getItem('token');

  // Request notification permission and set up notification check interval
  useEffect(() => {
    const requestPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      setNotificationsEnabled(Notification.permission === 'granted');
    };
    requestPermission();
  }, []);

  // Check for upcoming events every minute and trigger notifications
  useEffect(() => {
    const checkUpcomingEvents = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const now = new Date();
      events.forEach(event => {
        const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);
        const diffMs = eventDateTime.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // Notify 5 minutes before event (only once per session)
        if (diffMins > 0 && diffMins <= 5) {
          const notifiedKey = `notified_${event.id}_${event.event_date}_${event.event_time}`;
          if (!sessionStorage.getItem(notifiedKey)) {
            sessionStorage.setItem(notifiedKey, 'true');
            new Notification('Upcoming Study Session', {
              body: `${event.subject_name}${event.topic_name ? ` - ${event.topic_name}` : ''} starts in ${diffMins} minute${diffMins === 1 ? '' : 's'}`,
              icon: '/favicon.ico',
              tag: `event-${event.id}`
            });
          }
        }
      });
    };

    const interval = setInterval(checkUpcomingEvents, 60000); // Check every minute
    checkUpcomingEvents(); // Check immediately on mount

    return () => clearInterval(interval);
  }, [events]);

  useEffect(() => {
    fetchEvents();
    fetchSubjects();
  }, [token]);

  useEffect(() => {
    if (selectedSubject) {
      fetchTopics(selectedSubject);
    } else {
      setTopics([]);
    }
  }, [selectedSubject]);

  // Request notification permission and check for upcoming events
  useEffect(() => {
    if (notificationsEnabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [notificationsEnabled]);

  // Check for upcoming events every minute
  useEffect(() => {
    if (!notificationsEnabled || !('Notification' in window)) return;

    const checkUpcomingEvents = () => {
      const now = new Date();
      events.forEach(event => {
        const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);
        const diffMs = eventDateTime.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // Notify 5 minutes before and only if within the last minute (to avoid repeated notifications)
        if (diffMins === 5 || diffMins === 1) {
          const lastNotified = localStorage.getItem(`notified_${event.id}_${event.event_date}`);
          if (!lastNotified || parseInt(lastNotified) !== diffMins) {
            if (Notification.permission === 'granted') {
              new Notification('Study Session Starting Soon!', {
                body: `${event.subject_name}${event.topic_name ? ` - ${event.topic_name}` : ''} starts in ${diffMins} minute${diffMins === 1 ? '' : 's'}`,
                icon: '/favicon.ico'
              });
              localStorage.setItem(`notified_${event.id}_${event.event_date}`, String(diffMins));
            }
          }
        }
      });
    };

    const interval = setInterval(checkUpcomingEvents, 60000); // Check every minute
    checkUpcomingEvents(); // Check immediately on mount

    return () => clearInterval(interval);
  }, [events, notificationsEnabled]);

  const toggleNotifications = () => {
    if (!notificationsEnabled && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setNotificationsEnabled(true);
        }
      });
    } else {
      setNotificationsEnabled(!notificationsEnabled);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/calendar', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setEvents(await res.json());
    } catch (error) {
      console.error('Failed to fetch events', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await fetch('/api/subjects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setSubjects(await res.json());
    } catch (error) {
      console.error('Failed to fetch subjects', error);
    }
  };

  const fetchTopics = async (subjectId: string) => {
    try {
      const res = await fetch(`/api/topics?subject_id=${subjectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setTopics(await res.json());
    } catch (error) {
      console.error('Failed to fetch topics', error);
    }
  };


  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
      body: JSON.stringify({
        subject_id: selectedSubject,
        topic_id: selectedTopic || null,
        event_date: eventDate,
        event_time: eventTime,
        event_type: eventType,
        title: eventTitle || null,
        remarks
      })
    });

      if (res.ok) {
        setShowAddModal(false);
        resetForm();
        fetchEvents();
      }
    } catch (error) {
      console.error('Failed to add event', error);
    }
  };

  const resetForm = () => {
    setSelectedSubject('');
    setSelectedTopic('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setEventTime('09:00');
    setRemarks('');
    setEventType('study');
    setEventTitle('');
  };

  const fetchAISuggestions = async (subjectId?: string) => {
    const subjectIdToUse = subjectId || selectedSubjectForAI;
    if (!subjectIdToUse) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/calendar/suggest-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subject_id: subjectIdToUse })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to fetch AI suggestions', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchChatHistory = async () => {
    setChatHistoryLoading(true);
    try {
      const res = await fetch('/api/calendar/chat/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to fetch chat history', error);
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', content: message }]);

    try {
      const res = await fetch('/api/calendar/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          subject_id: selectedSubjectForAI || null
        })
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setAiSuggestions(data.suggestions);
        }
      }
    } catch (error) {
      console.error('Failed to send chat message', error);
    } finally {
      setChatLoading(false);
    }
  };

  const openAiCoachModal = async () => {
    if (subjects.length === 0) return;
    const defaultSubjectId = selectedSubjectForAI || String(subjects[0].id);
    setSelectedSubjectForAI(defaultSubjectId);
    setShowSuggestionsModal(true);
    await fetchAISuggestions(defaultSubjectId);
    await fetchChatHistory();
  };

  const addAISuggestions = async () => {
    try {
      const res = await fetch('/api/calendar/batch-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ events: aiSuggestions })
      });
      if (res.ok) {
        setShowSuggestionsModal(false);
        setAiSuggestions([]);
        fetchEvents();
      }
    } catch (error) {
      console.error('Failed to add AI suggestions', error);
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getEventsForDay = (date: Date) => {
    return events.filter(event => isSameDay(parseISO(event.event_date), date));
  };

  const kanbanSubjectIds = subjectFilter === 'all'
    ? subjects.map(s => String(s.id))
    : [subjectFilter];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link to="/dashboard" className="glass-back-link mb-6 inline-flex">
        <ArrowLeft size={18} /> Back to Dashboard
      </Link>

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white/95 tracking-tight">Study Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('calendar')}
              className={`glass-btn ${viewMode === 'calendar' ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`glass-btn ${viewMode === 'kanban' ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
            >
              Kanban
            </button>
          </div>
          <button
            onClick={toggleNotifications}
            className={`glass-btn ${notificationsEnabled ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
            title={notificationsEnabled ? 'Notifications enabled' : 'Enable notifications'}
          >
            <Bell size={18} />
            {notificationsEnabled ? 'On' : 'Off'}
          </button>
          <button
            onClick={() => {
              if (subjects.length > 0) {
                openAiCoachModal();
              }
            }}
            className="glass-btn glass-btn-secondary"
          >
            <Sparkles size={18} /> AI Suggest
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="glass-btn glass-btn-primary"
          >
            <Plus size={18} /> Add Event
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className="glass-calendar">
          {/* Month Header */}
          <div className="glass-cal-header flex items-center justify-between p-4">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="glass-icon-btn"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-lg font-bold text-white/90">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="glass-icon-btn"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day Headers */}
          <div className="glass-cal-dayrow grid grid-cols-7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-semibold text-white/40 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {calendarDays.map((day) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toString()}
                  className={`glass-cal-cell ${!isCurrentMonth ? 'opacity-30' : ''}`}
                >
                  <div className="text-xs font-medium mb-1.5">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                        isToday
                          ? 'bg-indigo-500/70 text-white font-bold'
                          : 'text-white/60'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                  {dayEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => setShowEventModal(event)}
                      className="glass-cal-event"
                      title={event.title || event.topic_name || event.subject_name}
                    >
                      {event.title || event.topic_name || event.subject_name}
                    </button>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-kanban">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white/90">Module Kanban</h2>
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/50">Filter Subject</label>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="glass-input"
              >
                <option value="all">All Subjects</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.subject_name}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const today = new Date();
            const dateColumns = eachDayOfInterval({ start: today, end: addDays(today, 13) });
            const gridStyle = {
              gridTemplateColumns: `220px repeat(${dateColumns.length}, minmax(120px, 1fr))`
            };

            const subjectNameById = new Map(subjects.map(s => [String(s.id), s.subject_name]));
            const rows = kanbanSubjectIds
              .map(id => ({ id, name: subjectNameById.get(id) || '' }))
              .filter(r => r.name);

            return (
              <div className="glass-kanban-board">
                <div className="glass-kanban-grid" style={gridStyle}>
                  <div className="glass-kanban-header-cell">Module</div>
                  {dateColumns.map(d => (
                    <div key={d.toISOString()} className="glass-kanban-header-cell">
                      {format(d, 'MMM d')}
                    </div>
                  ))}

                  {rows.map((row) => {
                    const rowEvents = events.filter(e => e.subject_name === row.name);
                    return (
                      <div key={row.id} className="glass-kanban-row">
                        <div className="glass-kanban-title-cell">
                          <div className="text-sm font-semibold text-white/85">{row.name}</div>
                          <div className="text-xs text-white/40">{rowEvents.length} sessions</div>
                        </div>
                        {dateColumns.map(d => {
                          const dateKey = format(d, 'yyyy-MM-dd');
                          const cellEvents = rowEvents.filter(e => e.event_date === dateKey);
                          return (
                            <div
                              key={`${row.id}-${dateKey}`}
                              className={`glass-kanban-cell ${cellEvents.length > 0 ? 'glass-kanban-cell-active' : ''}`}
                            >
                              {cellEvents.length > 0 ? (
                                <div className="glass-kanban-topics">
                                  {cellEvents.map(ev => (
                                    <div key={`${ev.id}-${ev.event_time}`} className="glass-kanban-topic">
                                      <span className="text-xs text-white/90">
                                        {ev.title || ev.topic_name || 'General review'}
                                      </span>
                                      <span className="text-[10px] text-white/45">{ev.event_time}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-white/30">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-white/95">Add Study Session</h3>
              <button onClick={() => setShowAddModal(false)} className="glass-icon-btn">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="glass-label">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="glass-input"
                  required
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.subject_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="glass-label">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="glass-input"
                  required
                >
                  <option value="study">Study Session</option>
                  <option value="submission">Submission</option>
                  <option value="project">Project Milestone</option>
                  <option value="exam">Exam</option>
                </select>
              </div>

              <div>
                <label className="glass-label">Title</label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="glass-input"
                  placeholder="e.g. Fractions practice or Biology Midterm"
                />
              </div>

              <div>
                <label className="glass-label">Topic (Optional)</label>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="glass-input"
                  disabled={!selectedSubject}
                >
                  <option value="">Select Topic</option>
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>{t.topic_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="glass-label">Date</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="glass-input"
                    required
                  />
                </div>
                <div>
                  <label className="glass-label">Time</label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="glass-input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="glass-label">Remarks (Optional)</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="glass-input"
                  rows={3}
                  placeholder="e.g. Focus on chapter 3 formulas"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="glass-btn glass-btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-btn glass-btn-primary flex-1 justify-center"
                >
                  Add Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Event Modal */}
      {showEventModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal relative">
            <button
              onClick={() => setShowEventModal(null)}
              className="glass-icon-btn absolute top-4 right-4"
            >
              <X size={18} />
            </button>

            <div className="mb-6 pr-8">
              <h3 className="text-2xl font-bold text-white/95 mb-2">
                {showEventModal.title || showEventModal.subject_name}
              </h3>
              {showEventModal.event_type && (
                <span className="glass-badge glass-badge-gray mr-2">
                  {showEventModal.event_type}
                </span>
              )}
              {showEventModal.topic_name && (
                <span className="glass-badge glass-badge-blue">
                  {showEventModal.topic_name}
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon size={18} className="mt-0.5 text-white/35 flex-shrink-0" />
                <div>
                  <p className="text-xs text-white/40 font-medium mb-0.5">Date</p>
                  <p className="text-sm text-white/80">
                    {format(parseISO(showEventModal.event_date), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock size={18} className="mt-0.5 text-white/35 flex-shrink-0" />
                <div>
                  <p className="text-xs text-white/40 font-medium mb-0.5">Time</p>
                  <p className="text-sm text-white/80">{showEventModal.event_time}</p>
                </div>
              </div>

              {showEventModal.remarks && (
                <div className="flex items-start gap-3">
                  <AlignLeft size={18} className="mt-0.5 text-white/35 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-white/40 font-medium mb-0.5">Remarks</p>
                    <p className="text-sm text-white/75 leading-relaxed">{showEventModal.remarks}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-7">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEventModal(null)}
                  className="glass-btn glass-btn-secondary flex-1 justify-center"
                >
                  Close
                </button>
                {showEventModal.topic_id && (showEventModal.event_type ?? 'study') === 'study' ? (
                  <Link
                    to={`/quiz/${showEventModal.topic_id}`}
                    className="glass-btn glass-btn-primary flex-1 justify-center"
                  >
                    Start Quiz
                  </Link>
                ) : (
                  <button
                    disabled
                    className="glass-btn glass-btn-primary flex-1 justify-center"
                    title="No topic linked to this session"
                  >
                    Start Quiz
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestions Modal */}
      {showSuggestionsModal && (
        <div className="glass-modal-overlay">
          <div className="glass-modal glass-modal-wide">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-white/95 flex items-center gap-2">
                <Sparkles size={20} className="text-indigo-400" /> AI Calendar Coach
              </h3>
              <button onClick={() => setShowSuggestionsModal(false)} className="glass-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div className="calendar-ai-layout">
              <div className="calendar-ai-chat">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-white/70 font-medium">Chat</p>
                    <p className="text-xs text-white/40">Ask for scheduling help or refinements.</p>
                  </div>
                </div>

                <div className="glass-chat-container">
                  <div className="glass-chat-area">
                    {chatHistoryLoading ? (
                      <div className="space-y-3 animate-pulse">
                        <div className="glass-skeleton h-10 w-2/3" />
                        <div className="glass-skeleton h-12 w-3/4 ml-auto" />
                        <div className="glass-skeleton h-10 w-1/2" />
                      </div>
                    ) : chatMessages.length > 0 ? (
                      chatMessages.map((m, idx) => (
                        <div key={idx} className={m.role === 'user' ? 'glass-msg-user' : 'glass-msg-ai'}>
                          {m.content}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-white/45">
                        No messages yet. Ask for a plan, or how to fit study sessions around existing events.
                      </div>
                    )}
                    {chatLoading && (
                      <div className="glass-msg-ai opacity-70">Thinking…</div>
                    )}
                  </div>

                  <form className="glass-chat-input-area" onSubmit={sendChatMessage}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="glass-input flex-1"
                      placeholder="e.g. Can you suggest sessions for the next 2 weeks?"
                    />
                    <button
                      type="submit"
                      className="glass-btn glass-btn-primary"
                      disabled={chatLoading || chatInput.trim().length === 0}
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>

              <div className="calendar-ai-suggestions">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-white/70 font-medium">Suggested Dates</p>
                    <p className="text-xs text-white/40">Based on weak topics and exams.</p>
                  </div>
                  <button
                    onClick={() => fetchAISuggestions(selectedSubjectForAI)}
                    className="glass-btn glass-btn-secondary"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mb-4">
                  <label className="glass-label">Subject</label>
                  <select
                    value={selectedSubjectForAI}
                    onChange={(e) => {
                      setSelectedSubjectForAI(e.target.value);
                      fetchAISuggestions(e.target.value);
                    }}
                    className="glass-input"
                    disabled={subjects.length === 0}
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.subject_name}</option>
                    ))}
                  </select>
                </div>

                {loadingSuggestions ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="glass-skeleton h-20 w-full" />
                    <div className="glass-skeleton h-20 w-full" />
                    <div className="glass-skeleton h-20 w-full" />
                  </div>
                ) : aiSuggestions.length > 0 ? (
                  <>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {aiSuggestions.map((suggestion, idx) => (
                        <div key={idx} className="glass-surface p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-white/90">
                              {suggestion.title || suggestion.topic_name || suggestion.subject_name}
                            </span>
                            <span className="text-xs text-white/40">{suggestion.event_date} at {suggestion.event_time}</span>
                          </div>
                          {suggestion.topic_name && (
                            <span className="text-sm text-indigo-300/80">{suggestion.topic_name}</span>
                          )}
                          {suggestion.remarks && (
                            <p className="text-xs text-white/50 mt-1">{suggestion.remarks}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setShowSuggestionsModal(false)}
                        className="glass-btn glass-btn-secondary flex-1 justify-center"
                      >
                        Close
                      </button>
                      <button
                        onClick={addAISuggestions}
                        className="glass-btn glass-btn-primary flex-1 justify-center"
                      >
                        Add All to Calendar
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-white/50">No suggestions yet.</p>
                    <button
                      onClick={() => fetchAISuggestions(selectedSubjectForAI)}
                      className="glass-btn glass-btn-secondary mt-4"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
