import React, { useState, useEffect } from 'react';
import { Clock, BookOpen, Award, Play, RotateCcw, CheckCircle, XCircle, AlertCircle, BarChart3, Home, Download, Bookmark } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

// This line imports the questions directly from a JSON file.
// Make sure you have a 'Questions.json' file in your 'src' folder.
import rawQuestionsData from './qae.json';

// --- Data Transformation ---
// This function converts the raw data from your JSON file into the format the application expects.
const transformQuestions = (rawData) => {
  return rawData.map((rawQ, index) => {
    // Combine options into a single array
    const options = [rawQ.OptionA, rawQ.OptionB, rawQ.OptionC, rawQ.OptionD].filter(Boolean);
    
    // Convert the correct answer letter (A, B, C, D) to a zero-based index (0, 1, 2, 3)
    const correctAnswerLetter = (rawQ.CorrectAnswer || 'A').trim().toUpperCase();
    let correctAnswerIndex = ['A', 'B', 'C', 'D'].indexOf(correctAnswerLetter);
    if (correctAnswerIndex === -1) {
        correctAnswerIndex = 0; // Default to A if the letter is invalid
    }

    // Normalize domain names to Title Case to match the weights object
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


// Helper functions to get/set data from browser's localStorage
const getFromStorage = (key, defaultValue) => {
  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue) {
      return JSON.parse(storedValue);
    }
  } catch (error) {
    console.error("Error reading from localStorage", error);
  }
  return defaultValue;
};

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Error saving to localStorage", error);
  }
};


// Main application component
const CISAPracticeApp = () => {
  // State for questions - now loaded and transformed from the imported JSON file
  const [allQuestions] = useState(() => transformQuestions(rawQuestionsData));
  const [questions, setQuestions] = useState([]); // Questions for the current session

  // State for application mode and navigation
  const [currentMode, setCurrentMode] = useState('analytics');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [lastSessionResults, setLastSessionResults] = useState(null);

  // State for user answers and progress
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

  // State for analytics - initialized from localStorage
  const [sessionHistory, setSessionHistory] = useState(() => getFromStorage('cisaApp_sessionHistory', []));
  const [domainPerformance, setDomainPerformance] = useState(() => getFromStorage('cisaApp_domainPerformance', {}));
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // State for advanced features - initialized from localStorage
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState(() => new Set(getFromStorage('cisaApp_bookmarked', [])));
  const [incorrectlyAnswered, setIncorrectlyAnswered] = useState(() => new Set(getFromStorage('cisaApp_incorrect', [])));

  // State to track script loading for PDF export
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  
  // Official CISA Domain Weights (Normalized to Title Case)
  const CISA_DOMAIN_WEIGHTS = {
    "Information System Auditing Process": 0.18,
    "Governance And Management Of It": 0.18,
    "Information Systems Acquisition, Development And Implementation": 0.12,
    "Information Systems Operations And Business Resilience": 0.26,
    "Protection Of Information Assets": 0.26,
  };

  // Effect to load external scripts for PDF export
  useEffect(() => {
    const loadScript = (src, onLoad) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = onLoad;
        document.body.appendChild(script);
        return script;
    };

    let jspdfLoaded = false, autotableLoaded = false;
    const checkAllLoaded = () => {
        if (jspdfLoaded && autotableLoaded) {
            setScriptsLoaded(true);
        }
    };

    const jspdfScript = loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => { jspdfLoaded = true; checkAllLoaded(); });
    const autotableScript = loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', () => { autotableLoaded = true; checkAllLoaded(); });

    return () => {
      document.body.removeChild(jspdfScript);
      document.body.removeChild(autotableScript);
    };
  }, []);

  // Effect to extract available domains once questions are loaded
  useEffect(() => {
    if (allQuestions.length > 0) {
        const domains = [...new Set(allQuestions.map(q => q.domain))];
        setAvailableDomains(domains);
    }
  }, [allQuestions]);

  // Effect to save progress to localStorage whenever it changes
  useEffect(() => {
    saveToStorage('cisaApp_sessionHistory', sessionHistory);
    saveToStorage('cisaApp_domainPerformance', domainPerformance);
    saveToStorage('cisaApp_bookmarked', [...bookmarkedQuestions]);
    saveToStorage('cisaApp_incorrect', [...incorrectlyAnswered]);
  }, [sessionHistory, domainPerformance, bookmarkedQuestions, incorrectlyAnswered]);

  // Timer effect for exam mode
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

  const resetSession = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
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
        const domainKey = q.domain.replace(/ /g, ''); // Make it robust to spacing differences
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
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(currentQuestion + 1);
    else handleSubmit();
  };

  const handlePreviousQuestion = () => { if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1); };

  const toggleBookmark = (questionId) => {
    setBookmarkedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) newSet.delete(questionId);
      else newSet.add(questionId);
      return newSet;
    });
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

  const exportResultsToPDF = () => {
    if (!scriptsLoaded || !lastSessionResults) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text("CISA Practice Session Results", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Date: ${new Date(lastSessionResults.date).toLocaleString()}`, 105, 30, { align: 'center' });

    doc.autoTable({
        startY: 40,
        head: [['Metric', 'Result']],
        body: [
            ['Mode', lastSessionResults.mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())],
            ['Total Questions', lastSessionResults.totalQuestions],
            ['Correct Answers', lastSessionResults.correctAnswers],
            ['Final Score', `${lastSessionResults.percentage}%`],
            ['Passing Probability', calculatePassingProbability(lastSessionResults.percentage)],
        ],
        theme: 'striped',
    });

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Domain', 'Correct', 'Total', 'Score']],
        body: Object.entries(lastSessionResults.domainBreakdown).map(([domain, data]) => [
            domain,
            data.correct,
            data.total,
            `${data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0}%`,
        ]),
        theme: 'grid',
    });

    doc.save(`CISA_Results_${lastSessionResults.id}.pdf`);
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

  const getDomainChartData = () => Object.entries(domainPerformance).map(([domain, stats]) => ({ domain, percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0 }));
  const getProgressChartData = () => sessionHistory.slice().reverse().map((session, index) => ({ session: `S${index + 1}`, score: session.percentage }));

  // --- RENDER LOGIC ---

  if (currentMode === 'setup' || currentMode === 'exam-setup') {
    const isExamSetup = currentMode === 'exam-setup';
    const domainQuestionCount = selectedDomain === 'all' ? allQuestions.length : allQuestions.filter(q => q.domain === selectedDomain).length;
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 flex items-center justify-center">
        <div className="max-w-2xl w-full mx-auto bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-6">{isExamSetup ? "Exam Setup" : "Practice Setup"}</h1>
          <div className="space-y-6">
            {isExamSetup ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of Questions</label>
                <select value={examQuestionCount} onChange={(e) => setExamQuestionCount(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value={150}>150 Questions (4 hours)</option>
                  <option value={100}>100 Questions (~2h 40m)</option>
                  <option value={50}>50 Questions (~1h 20m)</option>
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Domain</label>
                  <select value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="all">All Domains ({allQuestions.length})</option>
                    {availableDomains.map(d => <option key={d} value={d}>{d} ({allQuestions.filter(q => q.domain === d).length})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number of Questions</label>
                  <input type="number" min="1" max={domainQuestionCount} value={numberOfQuestions} onChange={(e) => setNumberOfQuestions(Math.min(parseInt(e.target.value) || 1, domainQuestionCount))} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  <input type="range" min="1" max={domainQuestionCount} value={numberOfQuestions} onChange={(e) => setNumberOfQuestions(parseInt(e.target.value))} className="w-full mt-2" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setCurrentMode('analytics')} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg">Back</button>
            <button onClick={isExamSetup ? startExamMode : () => startPracticeMode(null, 'practice')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2"><Play/> Start</button>
          </div>
        </div>
      </div>
    );
  }

  if (currentMode === 'analytics') {
    const stats = getOverallStats();
    const domainData = getDomainChartData();
    const progressData = getProgressChartData();
    const incorrectToReview = allQuestions.filter(q => incorrectlyAnswered.has(q.id));
    const bookmarkedToReview = allQuestions.filter(q => bookmarkedQuestions.has(q.id));

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-28"> 
          <h1 className="text-4xl font-bold text-gray-800 text-center mb-8">CISA Performance Dashboard</h1>
          
          {sessionHistory.length === 0 ? (
             <div className="text-center text-gray-500 py-16">
                <BarChart3 className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                <p className="text-xl">Welcome!</p>
                <p>Complete a session using the buttons below to see your progress.</p>
             </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white p-6 rounded-lg shadow-lg text-center"><p className="text-sm text-gray-500">Average Score</p><p className="text-3xl font-bold text-blue-600">{stats.averageScore}%</p></div>
                <div className="bg-white p-6 rounded-lg shadow-lg text-center"><p className="text-sm text-gray-500">Sessions</p><p className="text-3xl font-bold text-green-600">{stats.totalSessions}</p></div>
                <div className="bg-white p-6 rounded-lg shadow-lg text-center"><p className="text-sm text-gray-500">Questions Answered</p><p className="text-3xl font-bold text-purple-600">{stats.totalQuestions}</p></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white p-6 rounded-lg shadow-lg"><h3 className="font-semibold mb-4">Score Progress</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={progressData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="session" /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
                <div className="bg-white p-6 rounded-lg shadow-lg"><h3 className="font-semibold mb-4">Domain Performance</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={domainData} layout="vertical" margin={{ top: 5, right: 20, left: 200, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="domain" width={200} interval={0} /><Tooltip /><Bar dataKey="percentage" fill="#8B5CF6" /></BarChart></ResponsiveContainer></div></div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="font-semibold mb-4">Session History</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50"><tr><th className="p-2">Date</th><th className="p-2">Mode</th><th className="p-2">Score</th><th className="p-2">Questions</th><th className="p-2">Time</th></tr></thead>
                        <tbody>{sessionHistory.slice(0, 5).map(s => (<tr key={s.id} className="border-b">
                            <td className="p-2">{new Date(s.date).toLocaleDateString()}</td>
                            <td className="p-2">{s.mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                            <td className="p-2 font-bold">{s.percentage}%</td>
                            <td className="p-2">{s.totalQuestions}</td>
                            <td className="p-2">{s.timeSpent} min</td>
                        </tr>))}</tbody>
                    </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.1)] p-2">
            <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={() => setCurrentMode('setup')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 text-sm sm:text-base"><BookOpen size={20}/> Practice</button>
                <button onClick={() => setCurrentMode('exam-setup')} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 text-sm sm:text-base"><Award size={20}/> Exam</button>
                <button onClick={() => startPracticeMode(incorrectToReview, 'practice-incorrect')} disabled={incorrectToReview.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base"><RotateCcw size={20}/> Review Incorrect ({incorrectToReview.length})</button>
                <button onClick={() => startPracticeMode(bookmarkedToReview, 'practice-bookmarked')} disabled={bookmarkedToReview.length === 0} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base"><Bookmark size={20}/> Review Bookmarked ({bookmarkedToReview.length})</button>
            </div>
        </div>
      </div>
    );
  }

  if (currentMode === 'results') {
    const { percentage, domainBreakdown } = lastSessionResults;
    const isPassing = percentage >= 75;
    const probability = calculatePassingProbability(percentage);
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 flex items-center justify-center">
        <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">Session Complete!</h2>
            <p className={`text-xl mt-2 font-semibold ${isPassing ? 'text-green-600' : 'text-red-600'}`}>{isPassing ? 'Congratulations, you passed!' : 'Keep practicing!'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-100 rounded-lg p-6 text-center">
                <p className="text-5xl font-bold text-gray-800">{percentage}%</p>
                <p className="text-gray-600 mt-1">Overall Score</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-6 text-center">
                <p className="text-5xl font-bold text-gray-800">{probability}</p>
                <p className="text-gray-600 mt-1">Passing Probability</p>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-2 text-center">Domain Score Breakdown</h3>
            <div className="space-y-2">
                {Object.entries(domainBreakdown).map(([domain, data]) => {
                    const domainScore = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                    return (<div key={domain} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium">{domain}</span>
                            <span className="text-sm font-bold">{domainScore}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${domainScore}%` }}></div></div>
                    </div>)
                })}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <button onClick={() => setCurrentMode('analytics')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg">Back to Analytics</button>
            <button onClick={exportResultsToPDF} disabled={!scriptsLoaded} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 disabled:bg-gray-300"><Download size={20} /> Export PDF</button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentQuestion];
  if (!currentQ) {
    return (
        <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
            <div className="text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
                <h2 className="mt-4 text-xl font-semibold text-gray-700">Ready to Start?</h2>
                <p className="mt-2 text-gray-500">Select a mode from the dashboard to begin.</p>
                <button onClick={() => setCurrentMode('analytics')} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                    Go to Dashboard
                </button>
            </div>
        </div>
    );
  }

  const isAnswered = selectedAnswers[currentQ.id] !== undefined;
  const isCorrect = isAnswered && selectedAnswers[currentQ.id] === currentQ.correctAnswer;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-t-lg shadow-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-800 capitalize">{currentMode.replace('-', ' ')} Mode</h1>
              <p className="text-sm text-gray-600">{currentQ.domain}</p>
            </div>
            <div className="flex items-center gap-4">
              {currentMode === 'exam' && <div className="font-mono text-lg text-red-600 flex items-center gap-2"><Clock size={20} />{formatTime(timeRemaining)}</div>}
              <button onClick={() => setCurrentMode('analytics')} className="text-gray-500 hover:text-gray-800"><Home size={24} /></button>
            </div>
          </div>
          <div className="mt-4 bg-gray-200 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}></div></div>
        </div>
        <div className="bg-white shadow-lg p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-lg font-semibold text-gray-800 leading-snug flex-1"><span className="text-gray-500 mr-2">{currentQuestion + 1}.</span>{currentQ.question}</h2>
            <button onClick={() => toggleBookmark(currentQ.id)} className="ml-4 p-2 rounded-full hover:bg-yellow-100"><Bookmark className={`transition-colors ${bookmarkedQuestions.has(currentQ.id) ? 'fill-yellow-400 text-yellow-500' : 'text-gray-400'}`} /></button>
          </div>
          <div className="space-y-3">
            {currentQ.options.map((option, index) => {
              let btnClass = 'border-gray-300 hover:bg-gray-50';
              if (isAnswered && currentMode.startsWith('practice')) {
                if (index === currentQ.correctAnswer) btnClass = 'bg-green-100 border-green-400';
                else if (index === selectedAnswers[currentQ.id]) btnClass = 'bg-red-100 border-red-400';
              } else if (selectedAnswers[currentQ.id] === index) btnClass = 'border-blue-500 bg-blue-50';
              return (<button key={index} onClick={() => handleAnswerSelect(currentQ.id, index)} disabled={isAnswered && currentMode.startsWith('practice')} className={`w-full p-4 text-left border-2 rounded-lg transition-all flex items-start ${btnClass}`}><span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span><span>{option}</span></button>);
            })}
          </div>
        </div>
        {isAnswered && currentMode.startsWith('practice') && (
          <div className="bg-white shadow-lg p-6 border-t-2 border-slate-100">
            <h3 className={`font-bold text-lg mb-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>{isCorrect ? 'Correct!' : 'Incorrect'}</h3>
            <p className="text-gray-700"><strong>Explanation:</strong> {currentQ.explanation}</p>
          </div>
        )}
        <div className="bg-white rounded-b-lg shadow-lg p-4 flex justify-between items-center">
          <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">Prev</button>
          {currentQuestion === questions.length - 1 ? (<button onClick={handleSubmit} disabled={!isAnswered} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">Finish</button>) : (<button onClick={handleNextQuestion} disabled={!isAnswered} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">Next</button>)}
        </div>
      </div>
    </div>
  );
};

export default CISAPracticeApp;
