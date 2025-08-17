import React, { useState, useEffect } from 'react';
import { Clock, BookOpen, Award, Play, RotateCcw, CheckCircle, XCircle, AlertCircle, BarChart3, Home, Download, Bookmark, Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useSwipeable } from 'react-swipeable';
import Papa from 'papaparse';


// Import questions from JSON file
import rawQuestionsData from './qae.json';

// Data Transformation
const transformQuestions = (rawData) => {
  return rawData.map((rawQ, index) => {
    const options = [rawQ.OptionA, rawQ.OptionB, rawQ.OptionC, rawQ.OptionD].filter(Boolean);
    const correctAnswerLetter = (rawQ.CorrectAnswer || 'A').trim().toUpperCase();
    let correctAnswerIndex = ['A', 'B', 'C', 'D'].indexOf(correctAnswerLetter);
    if (correctAnswerIndex === -1) {
      correctAnswerIndex = 0;
    }
    const domain = (rawQ.Domain || 'General')
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return {
      id: rawQ.id || index + 1,
      question: rawQ.Question,
      options: options,
      correctAnswer: correctAnswerIndex,
      domain: domain,
      explanation: rawQ.Explanation || 'No explanation provided.'
    };
  });
};

// Memory storage helpers (no localStorage in artifacts)
const createMemoryStorage = () => {
  const storage = {};
  return {
    getItem: (key, defaultValue) => storage[key] || defaultValue,
    setItem: (key, value) => { storage[key] = value; }
  };
};

const memoryStorage = createMemoryStorage();

// Main application component
const CISAPracticeApp = () => {
  // State for questions
  const [allQuestions] = useState(() => transformQuestions(rawQuestionsData));
  const [questions, setQuestions] = useState([]);
  const [currentMode, setCurrentMode] = useState('analytics');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [lastSessionResults, setLastSessionResults] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  // State for exam mode
  const [examStartTime, setExamStartTime] = useState(null);
  const [examDuration, setExamDuration] = useState(240 * 60);
  const [timeRemaining, setTimeRemaining] = useState(240 * 60);

  // State for practice/exam setup
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [numberOfQuestions, setNumberOfQuestions] = useState(20);
  const [examQuestionCount, setExamQuestionCount] = useState(150);
  const [availableDomains, setAvailableDomains] = useState([]);

  // State for analytics
  const [sessionHistory, setSessionHistory] = useState(() => memoryStorage.getItem('sessionHistory', []));
  const [domainPerformance, setDomainPerformance] = useState(() => memoryStorage.getItem('domainPerformance', {}));
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // State for advanced features
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState(() => new Set(memoryStorage.getItem('bookmarked', [])));
  const [incorrectlyAnswered, setIncorrectlyAnswered] = useState(() => new Set(memoryStorage.getItem('incorrect', [])));

  // State for new features
  const [isDarkMode, setIsDarkMode] = useState(() => memoryStorage.getItem('darkMode', false));
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [questionTimes, setQuestionTimes] = useState({});

  // CISA Domain Weights
  const CISA_DOMAIN_WEIGHTS = {
    "Information System Auditing Process": 0.18,
    "Governance And Management Of It": 0.18,
    "Information Systems Acquisition, Development And Implementation": 0.12,
    "Information Systems Operations And Business Resilience": 0.26,
    "Protection Of Information Assets": 0.26,
  };

  // Set dark mode class on document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    memoryStorage.setItem('darkMode', isDarkMode);
  }, [isDarkMode]);

  // Extract available domains
  useEffect(() => {
    if (allQuestions.length > 0) {
      const domains = [...new Set(allQuestions.map(q => q.domain))];
      setAvailableDomains(domains);
    }
  }, [allQuestions]);

  // Save progress to memory storage
  useEffect(() => {
    memoryStorage.setItem('sessionHistory', sessionHistory);
    memoryStorage.setItem('domainPerformance', domainPerformance);
    memoryStorage.setItem('bookmarked', [...bookmarkedQuestions]);
    memoryStorage.setItem('incorrect', [...incorrectlyAnswered]);
  }, [sessionHistory, domainPerformance, bookmarkedQuestions, incorrectlyAnswered]);

  // Timer for exam mode
  useEffect(() => {
    let timer;
    if (currentMode === 'exam' && examStartTime) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
        const remaining = examDuration - elapsed;
        if (remaining <= 0) {
          handleSubmit();
        } else {
          setTimeRemaining(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentMode, examStartTime, examDuration]);

  // Timer for question in practice mode
  useEffect(() => {
    if (currentMode.startsWith('practice') && questions[currentQuestion]) {
      setQuestionStartTime(Date.now());
    }
    return () => {
      if (currentMode.startsWith('practice') && questions[currentQuestion]) {
        const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
        setQuestionTimes(prev => ({
          ...prev,
          [questions[currentQuestion].id]: (prev[questions[currentQuestion].id] || 0) + timeSpent
        }));
      }
    };
  }, [currentQuestion, currentMode, questions]);

  const resetSession = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setQuestionTimes({});
    setSessionStartTime(Date.now());
  };

  const startPracticeMode = (practiceQuestions, mode = 'practice') => {
    let questionsToSet;
    if (mode === 'practice') {
      let filtered = selectedDomain === 'all' ? [...allQuestions] : allQuestions.filter(q => q.domain === selectedDomain);
      questionsToSet = filtered.sort(() => 0.5 - Math.random()).slice(0, numberOfQuestions);
    } else {
      questionsToSet = practiceQuestions;
    }
    if (!questionsToSet || questionsToSet.length === 0) {
      alert("No questions available for this mode.");
      return;
    }
    setQuestions(questionsToSet);
    setCurrentMode(mode);
    resetSession();
  };

  const startExamMode = () => {
    const questionsByDomain = allQuestions.reduce((acc, q) => {
      const domainKey = q.domain.replace(/ /g, '');
      acc[domainKey] = acc[domainKey] || [];
      acc[domainKey].push(q);
      return acc;
    }, {});

    let examQuestions = [];
    for (const domain in CISA_DOMAIN_WEIGHTS) {
      const domainKey = domain.replace(/ /g, '');
      if (questionsByDomain[domainKey]) {
        const count = Math.round(examQuestionCount * CISA_DOMAIN_WEIGHTS[domain]);
        examQuestions.push(...questionsByDomain[domainKey].sort(() => 0.5 - Math.random()).slice(0, count));
      }
    }

    while (examQuestions.length < examQuestionCount && allQuestions.length > examQuestions.length) {
      const randomQ = allQuestions[Math.floor(Math.random() * allQuestions.length)];
      if (!examQuestions.find(q => q.id === randomQ.id)) {
        examQuestions.push(randomQ);
      }
    }
    examQuestions = examQuestions.slice(0, examQuestionCount);

    if (examQuestions.length < examQuestionCount) {
      alert(`Warning: Not enough questions to create a full ${examQuestionCount}-question exam. The exam will have ${examQuestions.length} questions.`);
    }

    const duration = Math.round((examQuestionCount / 150) * 240) * 60;
    setExamDuration(duration);
    setTimeRemaining(duration);
    setQuestions(examQuestions.sort(() => 0.5 - Math.random()));
    setCurrentMode('exam');
    resetSession();
    setExamStartTime(Date.now());
  };

  const handleAnswerSelect = (questionId, answerIndex) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: answerIndex }));
    if (currentMode.startsWith('practice')) {
      const isCorrect = questions[currentQuestion].correctAnswer === answerIndex;
      if (!isCorrect) setIncorrectlyAnswered(prev => new Set(prev).add(questionId));
      const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
      setQuestionTimes(prev => ({
        ...prev,
        [questionId]: (prev[questionId] || 0) + timeSpent
      }));
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(currentQuestion + 1);
    else handleSubmit();
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1);
  };

  const toggleBookmark = (questionId) => {
    setBookmarkedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) newSet.delete(questionId);
      else newSet.add(questionId);
      return newSet;
    });
  };

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const handleSubmit = () => {
    const results = recordSession();
    setLastSessionResults(results);
    setCurrentMode('results');
  };

  const recordSession = () => {
    const score = calculateScore();
    const timeSpent = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : 0;
    const domainBreakdown = questions.reduce((acc, q) => {
      acc[q.domain] = acc[q.domain] || { correct: 0, total: 0 };
      acc[q.domain].total++;
      if (selectedAnswers[q.id] === q.correctAnswer) acc[q.domain].correct++;
      return acc;
    }, {});

    const sessionData = {
      id: Date.now(),
      date: new Date().toISOString(),
      mode: currentMode,
      totalQuestions: questions.length,
      correctAnswers: score.correct,
      percentage: score.percentage,
      timeSpent,
      domainBreakdown,
      questionTimes: { ...questionTimes }
    };

    setSessionHistory(prev => [sessionData, ...prev]);

    setDomainPerformance(prev => {
      const updated = { ...prev };
      for (const domain in domainBreakdown) {
        if (!updated[domain]) updated[domain] = { correct: 0, total: 0 };
        updated[domain].correct += domainBreakdown[domain].correct;
        updated[domain].total += domainBreakdown[domain].total;
      }
      return updated;
    });
    return sessionData;
  };

  const calculateScore = () => {
    const correct = questions.filter(q => selectedAnswers[q.id] === q.correctAnswer).length;
    const total = questions.length;
    return { correct, total, percentage: total > 0 ? Math.round((correct / total) * 100) : 0 };
  };

  const calculatePassingProbability = (percentage) => {
    if (percentage < 50) return "Low";
    if (percentage < 65) return "Moderate";
    if (percentage < 75) return "High";
    return "Very High";
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getOverallStats = () => {
    if (sessionHistory.length === 0) return { averageScore: 0, totalSessions: 0, totalQuestions: 0 };
    const totalQuestions = sessionHistory.reduce((sum, s) => sum + s.totalQuestions, 0);
    const averageScore = sessionHistory.reduce((sum, s) => sum + s.percentage, 0) / sessionHistory.length;
    return { averageScore: Math.round(averageScore), totalSessions: sessionHistory.length, totalQuestions };
  };

  const getDomainChartData = () => Object.entries(domainPerformance).map(([domain, stats]) => ({
    domain,
    percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
  }));

  const getProgressChartData = () => sessionHistory.slice().reverse().map((session, index) => ({
    session: `S${index + 1}`,
    score: session.percentage
  }));

  // Setup Mode
  if (currentMode === 'setup' || currentMode === 'exam-setup') {
    const isExamSetup = currentMode === 'exam-setup';
    const domainQuestionCount = selectedDomain === 'all' ? allQuestions.length : allQuestions.filter(q => q.domain === selectedDomain).length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900 p-4 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/20 p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {isExamSetup ? "Exam Configuration" : "Practice Setup"}
                </h1>
                <p className="text-gray-600 dark:text-gray-300 mt-2">Configure your session parameters</p>
              </div>
              <button 
                onClick={toggleDarkMode} 
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105"
              >
                {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
              </button>
            </div>
            
            <div className="space-y-6">
              {isExamSetup ? (
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Exam Duration & Questions
                  </label>
                  <select
                    value={examQuestionCount}
                    onChange={(e) => setExamQuestionCount(Number(e.target.value))}
                    className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 transition-all duration-200 bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm"
                  >
                    <option value={150}>150 Questions (4 hours) - Full Exam</option>
                    <option value={100}>100 Questions (~2h 40m) - Practice Exam</option>
                    <option value={50}>50 Questions (~1h 20m) - Quick Test</option>
                  </select>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Knowledge Domain
                    </label>
                    <select
                      value={selectedDomain}
                      onChange={(e) => setSelectedDomain(e.target.value)}
                      className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 transition-all duration-200 bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm"
                    >
                      <option value="all">All Domains ({allQuestions.length} questions)</option>
                      {availableDomains.map(d => (
                        <option key={d} value={d}>{d} ({allQuestions.filter(q => q.domain === d).length} questions)</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Number of Questions: {numberOfQuestions}
                    </label>
                    <div className="space-y-3">
                      <input
                        type="range"
                        min="1"
                        max={domainQuestionCount}
                        value={numberOfQuestions}
                        onChange={(e) => setNumberOfQuestions(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>1</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">{numberOfQuestions}</span>
                        <span>{domainQuestionCount}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setCurrentMode('analytics')}
                className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold py-4 px-6 rounded-xl transition-all duration-200 hover:scale-[1.02]"
              >
                Back to Dashboard
              </button>
              <button
                onClick={isExamSetup ? startExamMode : () => startPracticeMode(null, 'practice')}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" /> 
                {isExamSetup ? 'Start Exam' : 'Start Practice'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analytics/Dashboard Mode
  if (currentMode === 'analytics') {
    const stats = getOverallStats();
    const domainData = getDomainChartData();
    const progressData = getProgressChartData();
    const incorrectToReview = allQuestions.filter(q => incorrectlyAnswered.has(q.id));
    const bookmarkedToReview = allQuestions.filter(q => bookmarkedQuestions.has(q.id));

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900">
        <div className="max-w-7xl mx-auto p-4 lg:p-8 pb-32">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                CISA Performance Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2 text-lg">
                Track your progress and master the CISA certification
              </p>
            </div>
            <button 
              onClick={toggleDarkMode} 
              className="p-3 rounded-full bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-gray-700/70 transition-all duration-200 hover:scale-105 shadow-lg"
            >
              {isDarkMode ? <Sun className="w-6 h-6 text-yellow-500" /> : <Moon className="w-6 h-6 text-gray-600" />}
            </button>
          </div>

          {sessionHistory.length === 0 ? (
            <div className="text-center py-20">
              <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-3xl p-12 shadow-xl border border-white/20 dark:border-gray-700/20 max-w-md mx-auto">
                <BarChart3 className="mx-auto h-20 w-20 text-blue-400 mb-6" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Welcome to CISA Practice!</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">Start your first session to see your progress and analytics here.</p>
                <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mx-auto"></div>
              </div>
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 text-center hover:scale-[1.02] transition-all duration-200">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Average Score</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {stats.averageScore}%
                  </p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 text-center hover:scale-[1.02] transition-all duration-200">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Sessions Completed</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    {stats.totalSessions}
                  </p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 text-center hover:scale-[1.02] transition-all duration-200">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Questions Answered</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                    {stats.totalQuestions}
                  </p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20">
                  <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Score Progress Over Time
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={progressData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="session" stroke="#64748b" />
                        <YAxis domain={[0, 100]} stroke="#64748b" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                            border: 'none', 
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
                          }} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="score" 
                          stroke="#3B82F6" 
                          strokeWidth={3}
                          dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20">
                  <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    Domain Performance
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={domainData} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                        <YAxis type="category" dataKey="domain" width={120} interval={0} stroke="#64748b" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                            border: 'none', 
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
                          }} 
                        />
                        <Bar dataKey="percentage" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Session History */}
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    Recent Sessions
                  </h3>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] shadow-lg">
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <button className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] shadow-lg">
                      <Download className="w-4 h-4" /> Export PDF
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/80 dark:bg-gray-700/50 backdrop-blur-sm">
                        <th className="p-4 text-left font-semibold text-gray-700 dark:text-gray-200 rounded-tl-lg">Date</th>
                        <th className="p-4 text-left font-semibold text-gray-700 dark:text-gray-200">Mode</th>
                        <th className="p-4 text-left font-semibold text-gray-700 dark:text-gray-200">Score</th>
                        <th className="p-4 text-left font-semibold text-gray-700 dark:text-gray-200">Questions</th>
                        <th className="p-4 text-left font-semibold text-gray-700 dark:text-gray-200 rounded-tr-lg">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionHistory.slice(0, 5).map((s, index) => (
                        <tr key={s.id} className="border-t border-gray-100 dark:border-gray-600/30 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="p-4 text-gray-800 dark:text-gray-200">{new Date(s.date).toLocaleDateString()}</td>
                          <td className="p-4">
                            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                              {s.mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-gray-800 dark:text-gray-200">
                            <span className={`${s.percentage >= 75 ? 'text-green-600 dark:text-green-400' : s.percentage >= 65 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                              {s.percentage}%
                            </span>
                          </td>
                          <td className="p-4 text-gray-800 dark:text-gray-200">{s.totalQuestions}</td>
                          <td className="p-4 text-gray-800 dark:text-gray-200">{s.timeSpent} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Floating Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-t border-white/20 dark:border-gray-700/20 p-4">
          <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => setCurrentMode('setup')}
              className="group bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg"
            >
              <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
              <span className="hidden sm:inline">Practice Mode</span>
              <span className="sm:hidden">Practice</span>
            </button>
            <button
              onClick={() => setCurrentMode('exam-setup')}
              className="group bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg"
            >
              <Award className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
              <span className="hidden sm:inline">Exam Mode</span>
              <span className="sm:hidden">Exam</span>
            </button>
            <button
              onClick={() => startPracticeMode(incorrectToReview, 'practice-incorrect')}
              disabled={incorrectToReview.length === 0}
              className="group bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <RotateCcw className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
              <span className="hidden lg:inline">Review Incorrect</span>
              <span className="lg:hidden">Incorrect</span>
              <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">({incorrectToReview.length})</span>
            </button>
            <button
              onClick={() => startPracticeMode(bookmarkedToReview, 'practice-bookmarked')}
              disabled={bookmarkedToReview.length === 0}
              className="group bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Bookmark className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
              <span className="hidden lg:inline">Review Bookmarked</span>
              <span className="lg:hidden">Bookmarked</span>
              <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">({bookmarkedToReview.length})</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results Mode
  if (currentMode === 'results') {
    const { percentage, domainBreakdown } = lastSessionResults;
    const probability = calculatePassingProbability(percentage);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900 p-4 flex items-center justify-center">
        <div className="w-full max-w-4xl">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/20 p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Session Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-2">Here's how you performed</p>
              </div>
              <button 
                onClick={toggleDarkMode} 
                className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105"
              >
                {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
              </button>
            </div>

            {/* Score Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-8 text-center border border-blue-200/50 dark:border-blue-800/50">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-8 h-8 text-white" />
                </div>
                <p className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                  {percentage}%
                </p>
                <p className="text-gray-600 dark:text-gray-300 font-medium">Overall Score</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-8 text-center border border-green-200/50 dark:border-green-800/50">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <p className="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
                  {probability}
                </p>
                <p className="text-gray-600 dark:text-gray-300 font-medium">Passing Probability</p>
              </div>
            </div>

            {/* Domain Breakdown */}
            <div className="mb-8">
              <h3 className="font-bold text-xl mb-6 text-gray-800 dark:text-gray-100 text-center flex items-center justify-center gap-2">
                <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                Domain Performance Breakdown
              </h3>
              <div className="space-y-4">
                {Object.entries(domainBreakdown).map(([domain, data]) => {
                  const domainScore = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                  const getScoreColor = (score) => {
                    if (score >= 80) return 'from-green-500 to-emerald-500';
                    if (score >= 70) return 'from-yellow-500 to-amber-500';
                    if (score >= 60) return 'from-orange-500 to-red-500';
                    return 'from-red-500 to-red-600';
                  };
                  return (
                    <div key={domain} className="bg-gray-50/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 dark:border-gray-600/50">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{domain}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{data.correct}/{data.total}</span>
                          <span className="font-bold text-gray-800 dark:text-gray-200">{domainScore}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${getScoreColor(domainScore)} rounded-full transition-all duration-500 ease-out`} 
                          style={{ width: `${domainScore}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setCurrentMode('analytics')}
                className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <Home className="w-5 h-5" /> Back to Dashboard
              </button>
              <button
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" /> Export Results
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question Mode (Practice/Exam)
  const currentQ = questions[currentQuestion];
  if (!currentQ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 shadow-xl border border-white/20 dark:border-gray-700/20">
            <AlertCircle className="mx-auto h-16 w-16 text-blue-400 mb-6" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">Ready to Start?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Choose a mode from the dashboard to begin your CISA preparation.</p>
            <button
              onClick={() => setCurrentMode('analytics')}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 hover:scale-[1.02]"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAnswered = selectedAnswers[currentQ.id] !== undefined;
  const isCorrect = isAnswered && selectedAnswers[currentQ.id] === currentQ.correctAnswer;
  const currentQuestionTime = questionStartTime ? Math.round((Date.now() - questionStartTime) / 1000) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-0">
        {/* Header Card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-t-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
                <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 capitalize">
                  {currentMode.replace('-', ' ')} Mode
                </h1>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{currentQ.domain}</p>
            </div>
            <div className="flex items-center gap-4">
              {currentMode === 'exam' && (
                <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-mono font-bold">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(timeRemaining)}</span>
                  </div>
                </div>
              )}
              {currentMode.startsWith('practice') && (
                <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-mono font-bold">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(currentQuestionTime)}</span>
                  </div>
                </div>
              )}
              <button 
                onClick={toggleDarkMode} 
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105"
              >
                {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
              </button>
              <button
                onClick={() => setCurrentMode('analytics')}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105 text-gray-600 dark:text-gray-400"
              >
                <Home className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Question {currentQuestion + 1} of {questions.length}</span>
              <span>{Math.round(((currentQuestion + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-xl border-x border-white/20 dark:border-gray-700/20 p-6">
          <div className="flex justify-between items-start gap-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 leading-relaxed flex-1">
              <span className="text-blue-600 dark:text-blue-400 font-bold mr-3">{currentQuestion + 1}.</span>
              {currentQ.question}
            </h2>
            <button
              onClick={() => toggleBookmark(currentQ.id)}
              className="p-3 rounded-full hover:bg-yellow-50 dark:hover:bg-yellow-900/30 transition-all duration-200 hover:scale-105 flex-shrink-0"
            >
              <Bookmark
                className={`w-6 h-6 transition-colors ${
                  bookmarkedQuestions.has(currentQ.id) 
                    ? 'fill-yellow-400 text-yellow-500' 
                    : 'text-gray-400 dark:text-gray-500 hover:text-yellow-500'
                }`}
              />
            </button>
          </div>
          
          {/* Answer Options */}
          <div className="space-y-3">
            {currentQ.options.map((option, index) => {
              let btnClass = 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20';
              let iconColor = 'text-gray-400';
              let showIcon = null;
              
              if (isAnswered && currentMode.startsWith('practice')) {
                if (index === currentQ.correctAnswer) {
                  btnClass = 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-600 shadow-green-100 dark:shadow-green-900/50';
                  iconColor = 'text-green-600';
                  showIcon = <CheckCircle className="w-5 h-5" />;
                } else if (index === selectedAnswers[currentQ.id]) {
                  btnClass = 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-600 shadow-red-100 dark:shadow-red-900/50';
                  iconColor = 'text-red-600';
                  showIcon = <XCircle className="w-5 h-5" />;
                }
              } else if (selectedAnswers[currentQ.id] === index) {
                btnClass = 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-blue-100 dark:shadow-blue-900/50';
                iconColor = 'text-blue-600';
              }
              
              return (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(currentQ.id, index)}
                  disabled={isAnswered && currentMode.startsWith('practice')}
                  className={`w-full p-4 text-left border-2 rounded-xl transition-all duration-200 hover:scale-[1.01] flex items-center gap-4 shadow-sm ${btnClass} ${
                    !(isAnswered && currentMode.startsWith('practice')) ? 'hover:shadow-md' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`font-bold text-lg ${iconColor === 'text-gray-400' ? 'text-gray-600 dark:text-gray-300' : iconColor}`}>
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <span className="text-gray-800 dark:text-gray-200 flex-1">{option}</span>
                  </div>
                  {showIcon && (
                    <div className={iconColor}>
                      {showIcon}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Explanation Card (Practice Mode Only) */}
        {isAnswered && currentMode.startsWith('practice') && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-xl border-x border-white/20 dark:border-gray-700/20 p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${isCorrect ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {isCorrect ? 
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" /> : 
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                }
              </div>
              <div className="flex-1">
                <h3 className={`font-bold text-lg mb-2 ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isCorrect ? 'Correct Answer!' : 'Incorrect Answer'}
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Explanation: </span>
                    {currentQ.explanation}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-b-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-6">
          <div className="flex justify-between items-center">
            <button
              onClick={handlePreviousQuestion}
              disabled={currentQuestion === 0}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                {Object.keys(selectedAnswers).length} of {questions.length} answered
              </span>
              {currentQuestion === questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={!isAnswered}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] disabled:from-gray-400 disabled:to-gray-500 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                >
                  <Award className="w-5 h-5" />
                  Finish Session
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  disabled={!isAnswered}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] disabled:from-gray-400 disabled:to-gray-500 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                >
                  Next Question
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CISAPracticeApp;
                
