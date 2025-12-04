// Import Firebase functions
import { db, collection, doc, setDoc, getDoc, getDocs, updateDoc, query, orderBy, limit } from './firebase-config.js';

// Main Game Logic
let currentPlayer = null;
let currentStageId = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkLoginStatus();
    setupEventListeners();
    updateCountdown();
    setInterval(updateCountdown, 1000);
});

// Show loading spinner
function showLoading(show = true) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}

// Check if user is logged in
async function checkLoginStatus() {
    const email = localStorage.getItem('currentPlayerEmail');
    if (email) {
        showLoading(true);
        currentPlayer = await getCurrentPlayer(email);
        showLoading(false);
        
        if (currentPlayer) {
            showGameScreen();
            return;
        }
    }
    showLoginScreen();
}

// Show login screen
function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('gameScreen').classList.remove('active');
}

// Show game screen
function showGameScreen() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    
    updatePlayerInfo();
    renderStages();
    
    // Show admin panel if admin
    if (currentPlayer && currentPlayer.email === ADMIN_EMAIL) {
        document.getElementById('adminPanel').style.display = 'block';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Leaderboard button
    document.getElementById('showLeaderboardBtn').addEventListener('click', showLeaderboard);
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    // Admin buttons
    const showAdminBtn = document.getElementById('showAdminBtn');
    if (showAdminBtn) {
        showAdminBtn.addEventListener('click', showAdminPanel);
    }
    
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', exportGameData);
    }
    
    // Admin tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchAdminTab(tabName);
        });
    });
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim().toLowerCase();
    const phone = document.getElementById('userPhone').value.trim();
    
    if (!name || !email) {
        alert('الرجاء إدخال الاسم والبريد الإلكتروني');
        return;
    }
    
    showLoading(true);
    
    try {
        // Check if player exists in Firestore
        const playerDoc = await getDoc(doc(db, 'players', email));
        let player;
        
        if (playerDoc.exists()) {
            // Update existing player
            player = playerDoc.data();
            player.name = name;
            player.phone = phone;
            player.lastActive = new Date().toISOString();
            
            await updateDoc(doc(db, 'players', email), {
                name: player.name,
                phone: player.phone,
                lastActive: player.lastActive
            });
        } else {
            // Create new player
            player = {
                name: name,
                email: email,
                phone: phone,
                registrationDate: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                progress: stages.map(stage => ({
                    stageId: stage.id,
                    completed: false,
                    score: 0,
                    attempts: 0,
                    completedChallenges: []
                }))
            };
            
            await setDoc(doc(db, 'players', email), player);
        }
        
        localStorage.setItem('currentPlayerEmail', email);
        currentPlayer = player;
        
        showLoading(false);
        showGameScreen();
    } catch (error) {
        console.error('Error during login:', error);
        showLoading(false);
        alert('حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى.');
    }
}

// Handle logout
function handleLogout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.removeItem('currentPlayerEmail');
        currentPlayer = null;
        currentStageId = null;
        showLoginScreen();
    }
}

// Update player info display
function updatePlayerInfo() {
    if (!currentPlayer) return;
    
    document.getElementById('displayName').textContent = currentPlayer.name;
    
    const totalScore = currentPlayer.progress.reduce((sum, p) => sum + p.score, 0);
    document.getElementById('userScore').textContent = totalScore;
}

// Render stages
function renderStages() {
    const grid = document.getElementById('stagesGrid');
    grid.innerHTML = '';
    
    stages.forEach(stage => {
        const stageProgress = currentPlayer.progress.find(p => p.stageId === stage.id);
        const isUnlocked = isStageUnlocked(stage.id);
        const isCompleted = stageProgress && stageProgress.completed;
        
        const stageCard = document.createElement('div');
        stageCard.className = 'stage-card';
        
        if (!isUnlocked) {
            stageCard.classList.add('locked');
        }
        if (isCompleted) {
            stageCard.classList.add('completed');
        }
        
        let statusText = '';
        if (!isUnlocked) {
            const unlockDate = new Date(stage.unlockDate);
            statusText = `يُفتح في ${unlockDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}`;
        } else if (isCompleted) {
            statusText = `✓ مكتمل - ${stageProgress.score} نقطة`;
        } else {
            statusText = 'متاح الآن';
        }
        
        stageCard.innerHTML = `
            <div class="stage-icon">${stage.icon}</div>
            <div class="stage-title">${stage.title}</div>
            <div class="stage-status">${statusText}</div>
            ${isCompleted ? '<div class="stage-badge">✓</div>' : ''}
        `;
        
        if (isUnlocked) {
            stageCard.addEventListener('click', () => loadStage(stage.id));
        }
        
        grid.appendChild(stageCard);
    });
}

// Load stage
function loadStage(stageId) {
    currentStageId = stageId;
    const stage = stages.find(s => s.id === stageId);
    const stageProgress = currentPlayer.progress.find(p => p.stageId === stageId);
    
    if (!stage || !isStageUnlocked(stageId)) {
        return;
    }
    
    const content = document.getElementById('stageContent');
    content.innerHTML = `
        <div class="challenge-header">
            <h2>${stage.icon} ${stage.title}</h2>
            <p class="challenge-description">${stage.description}</p>
            <div style="text-align: center; margin: 1rem 0;">
                <span style="color: var(--accent-yellow); font-weight: 700;">
                    نقاطك في هذه المرحلة: ${stageProgress.score}
                </span>
            </div>
        </div>
        <div id="challengesContainer"></div>
    `;
    
    renderChallenges(stage, stageProgress);
    
    // Scroll to content
    content.scrollIntoView({ behavior: 'smooth' });
}

// Render challenges
function renderChallenges(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    container.innerHTML = '';
    
    // ========== إضافة جديدة للمراحل الخاصة ==========
    
    // تحقق من نوع المرحلة الخاص
    if (stage.specialType === 'password_puzzle') {
        renderPasswordPuzzleStage(stage, stageProgress);
        return;
    }
    
    if (stage.specialType === 'platform_game') {
        renderPlatformGameStage(stage, stageProgress);
        return;
    }
    
    if (stage.specialType === 'robot_lab') {
        renderRobotLabStage(stage, stageProgress);
        return;
    }
    
    // ========== نهاية الإضافة ==========
    
    // الكود الأصلي للمراحل العادية يستمر هنا...
    stage.challenges.forEach((challenge, index) => {
        // ... الكود الموجود
    });
}

function renderChallenges(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    container.innerHTML = '';
    
    // ✨ أضف هذا الكود ✨
    if (stage.specialType === 'password_puzzle') {
        renderPasswordPuzzleStage(stage, stageProgress);
        return;
    }
    if (stage.specialType === 'platform_game') {
        renderPlatformGameStage(stage, stageProgress);
        return;
    }
    if (stage.specialType === 'robot_lab') {
        renderRobotLabStage(stage, stageProgress);
        return;
    }
    // ✨ نهاية الإضافة ✨
    
    // الكود الأصلي يستمر...
}
function renderChallenges(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    container.innerHTML = '';
    
    stage.challenges.forEach((challenge, index) => {
        const isCompleted = stageProgress.completedChallenges.includes(index);
        
        const challengeDiv = document.createElement('div');
        challengeDiv.className = challenge.type === 'quiz' ? 'quiz-section' : 'puzzle-section';
        challengeDiv.style.opacity = isCompleted ? '0.6' : '1';
        
        let challengeHTML = `
            <h3>${isCompleted ? '✓ ' : ''}السؤال ${index + 1} ${isCompleted ? '(مكتمل)' : ''}</h3>
            <p style="font-size: 1.1rem; margin: 1rem 0;">${challenge.question}</p>
            <p style="color: var(--accent-yellow); margin: 0.5rem 0;">النقاط: ${challenge.points}</p>
        `;
        
        if (!isCompleted) {
            if (challenge.type === 'quiz') {
                challengeHTML += '<div class="quiz-options">';
                challenge.options.forEach((option, optIndex) => {
                    challengeHTML += `
                        <div class="quiz-option" data-challenge="${index}" data-option="${optIndex}">
                            ${option}
                        </div>
                    `;
                });
                challengeHTML += '</div>';
            } else if (challenge.type === 'puzzle') {
                challengeHTML += `
                    <input type="text" class="puzzle-input" id="puzzle-${index}" 
                           placeholder="أدخل إجابتك هنا..." />
                    ${challenge.hint ? `<p style="color: var(--text-gray); font-size: 0.9rem; margin-top: 0.5rem;">💡 ${challenge.hint}</p>` : ''}
                `;
            }
            
            challengeHTML += `
                <button class="submit-answer" data-challenge="${index}">
                    إرسال الإجابة
                </button>
                <div id="feedback-${index}" class="feedback-message" style="display: none;"></div>
            `;
        } else {
            challengeHTML += '<p style="color: var(--primary-green); margin-top: 1rem;">✓ تم إكمال هذا التحدي</p>';
        }
        
        challengeDiv.innerHTML = challengeHTML;
        container.appendChild(challengeDiv);
    });
    
    // Add event listeners
    document.querySelectorAll('.quiz-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const challengeIndex = e.target.dataset.challenge;
            document.querySelectorAll(`.quiz-option[data-challenge="${challengeIndex}"]`).forEach(opt => {
                opt.classList.remove('selected');
            });
            e.target.classList.add('selected');
        });
    });
    
    document.querySelectorAll('.submit-answer').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const challengeIndex = parseInt(e.target.dataset.challenge);
            checkAnswer(stage, challengeIndex);
        });
    });
}

// Check answer
async function checkAnswer(stage, challengeIndex) {
    const challenge = stage.challenges[challengeIndex];
    const feedbackDiv = document.getElementById(`feedback-${challengeIndex}`);
    let isCorrect = false;
    
    if (challenge.type === 'quiz') {
        const selectedOption = document.querySelector(`.quiz-option[data-challenge="${challengeIndex}"].selected`);
        if (!selectedOption) {
            alert('الرجاء اختيار إجابة');
            return;
        }
        const selectedIndex = parseInt(selectedOption.dataset.option);
        isCorrect = selectedIndex === challenge.correctAnswer;
    } else if (challenge.type === 'puzzle') {
        const input = document.getElementById(`puzzle-${challengeIndex}`);
        const userAnswer = input.value.trim();
        
        if (!userAnswer) {
            alert('الرجاء إدخال إجابة');
            return;
        }
        
        if (challenge.caseSensitive === false) {
            isCorrect = userAnswer.toLowerCase() === challenge.correctAnswer.toLowerCase();
        } else {
            isCorrect = userAnswer === challenge.correctAnswer;
        }
    }
    
    // Update progress
    const stageProgress = currentPlayer.progress.find(p => p.stageId === stage.id);
    stageProgress.attempts++;
    
    if (isCorrect) {
        feedbackDiv.className = 'feedback-message success';
        feedbackDiv.textContent = `✓ إجابة صحيحة! حصلت على ${challenge.points} نقطة`;
        feedbackDiv.style.display = 'block';
        
        if (!stageProgress.completedChallenges.includes(challengeIndex)) {
            stageProgress.completedChallenges.push(challengeIndex);
            stageProgress.score += challenge.points;
        }
        
        // Check if stage is completed
        if (stageProgress.completedChallenges.length === stage.challenges.length) {
            stageProgress.completed = true;
        }
        
        // Save to Firestore
        showLoading(true);
        try {
            await updateDoc(doc(db, 'players', currentPlayer.email), {
                progress: currentPlayer.progress,
                lastActive: new Date().toISOString()
            });
            
            // Check if stage is completed
            if (stageProgress.completed && stageProgress.completedChallenges.length === stage.challenges.length) {
                setTimeout(() => {
                    showStageCompletionMessage(stage, stageProgress.score);
                }, 1500);
            }
            
            showLoading(false);
            updatePlayerInfo();
            
            // Reload stage after delay
            setTimeout(() => {
                loadStage(stage.id);
            }, 2000);
        } catch (error) {
            console.error('Error saving progress:', error);
            showLoading(false);
            alert('حدث خطأ أثناء حفظ التقدم');
        }
    } else {
        feedbackDiv.className = 'feedback-message error';
        feedbackDiv.textContent = '✗ إجابة خاطئة، حاول مرة أخرى';
        feedbackDiv.style.display = 'block';
        
        // Save attempt count
        showLoading(true);
        try {
            await updateDoc(doc(db, 'players', currentPlayer.email), {
                progress: currentPlayer.progress,
                lastActive: new Date().toISOString()
            });
            showLoading(false);
        } catch (error) {
            console.error('Error saving attempt:', error);
            showLoading(false);
        }
    }
}

// Show stage completion message
function showStageCompletionMessage(stage, score) {
    const completedStages = currentPlayer.progress.filter(p => p.completed).length;
    
    let message = `🎉 تهانينا! أكملت ${stage.title}\n\n`;
    message += `حصلت على ${score} نقطة في هذه المرحلة\n\n`;
    
    if (completedStages === stages.length) {
        message += `🏆 رائع! أكملت جميع المراحل!\n`;
        message += `أنت الآن من أوائل المتسابقين\n`;
        message += `تابع لوحة المتصدرين لمعرفة ترتيبك النهائي`;
    } else {
        message += `أكملت ${completedStages} من ${stages.length} مرحلة\n`;
        message += `استمر لإكمال المراحل المتبقية!`;
    }
    
    alert(message);
    renderStages();
}

// Show leaderboard
async function showLeaderboard() {
    showLoading(true);
    const modal = document.getElementById('leaderboardModal');
    const tbody = document.getElementById('leaderboardBody');
    
    try {
        const leaderboard = await getLeaderboard();
        tbody.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            
            let rankDisplay = index + 1;
            if (index === 0) rankDisplay = '🥇';
            else if (index === 1) rankDisplay = '🥈';
            else if (index === 2) rankDisplay = '🥉';
            
            const isCurrentPlayer = player.email === currentPlayer.email;
            if (isCurrentPlayer) {
                row.style.background = 'rgba(46, 204, 113, 0.2)';
                row.style.fontWeight = '700';
            }
            
            row.innerHTML = `
                <td class="rank-medal">${rankDisplay}</td>
                <td>${player.name}${isCurrentPlayer ? ' (أنت)' : ''}</td>
                <td>${player.completedStages} / ${stages.length}</td>
                <td>${player.totalScore}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        showLoading(false);
        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        showLoading(false);
        alert('حدث خطأ أثناء تحميل لوحة المتصدرين');
    }
}

// Show admin panel
async function showAdminPanel() {
    const modal = document.getElementById('adminModal');
    modal.classList.add('active');
    
    showLoading(true);
    await updateParticipantsList();
    await updateProgressStats();
    showLoading(false);
}

// Update participants list
async function updateParticipantsList() {
    const container = document.getElementById('participantsList');
    
    try {
        const players = await getAllPlayers();
        
        if (players.length === 0) {
            container.innerHTML = '<p>لا يوجد مشاركون بعد</p>';
            return;
        }
        
        let html = '<table class="leaderboard-table"><thead><tr>';
        html += '<th>الاسم</th><th>البريد</th><th>الهاتف</th><th>تاريخ التسجيل</th><th>المراحل</th><th>النقاط</th>';
        html += '</tr></thead><tbody>';
        
        players.forEach(player => {
            const completedStages = player.progress.filter(p => p.completed).length;
            const totalScore = player.progress.reduce((sum, p) => sum + p.score, 0);
            const regDate = new Date(player.registrationDate).toLocaleDateString('ar-EG');
            
            html += '<tr>';
            html += `<td>${player.name}</td>`;
            html += `<td>${player.email}</td>`;
            html += `<td>${player.phone || 'غير محدد'}</td>`;
            html += `<td>${regDate}</td>`;
            html += `<td>${completedStages}/${stages.length}</td>`;
            html += `<td>${totalScore}</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading participants:', error);
        container.innerHTML = '<p>حدث خطأ أثناء تحميل البيانات</p>';
    }
}

// Update progress stats
async function updateProgressStats() {
    const container = document.getElementById('progressStats');
    
    try {
        const players = await getAllPlayers();
        
        let html = '<div style="margin: 2rem 0;">';
        html += `<h4>إحصائيات عامة</h4>`;
        html += `<p>إجمالي المشاركين: ${players.length}</p>`;
        
        stages.forEach(stage => {
            const completedCount = players.filter(p => 
                p.progress.find(prog => prog.stageId === stage.id && prog.completed)
            ).length;
            
            const percentage = players.length > 0 ? ((completedCount / players.length) * 100).toFixed(1) : 0;
            
            html += `
                <div style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 10px;">
                    <strong>${stage.icon} ${stage.title}</strong><br>
                    أكمله: ${completedCount} من ${players.length} (${percentage}%)
                    <div style="background: rgba(255,255,255,0.1); height: 10px; border-radius: 5px; margin-top: 0.5rem;">
                        <div style="background: var(--primary-green); height: 100%; width: ${percentage}%; border-radius: 5px;"></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading progress stats:', error);
        container.innerHTML = '<p>حدث خطأ أثناء تحميل الإحصائيات</p>';
    }
}

// Switch admin tab
function switchAdminTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
    
    if (tabName === 'participants') updateParticipantsList();
    if (tabName === 'progress') updateProgressStats();
}

// Close all modals
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Update countdown
function updateCountdown() {
    const countdownEl = document.getElementById('countdown');
    if (!countdownEl) return;
    
    const nextUnlock = getNextUnlockDate();
    if (!nextUnlock) {
        countdownEl.textContent = 'جميع المراحل متاحة!';
        return;
    }
    
    const now = new Date();
    const diff = nextUnlock - now;
    
    if (diff <= 0) {
        countdownEl.textContent = 'المرحلة متاحة الآن!';
        renderStages(); // Refresh stages
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownEl.textContent = `${days} يوم ${hours} ساعة ${minutes} دقيقة ${seconds} ثانية`;
}

// Firebase helper functions

// Get current player from Firestore
async function getCurrentPlayer(email) {
    try {
        const playerDoc = await getDoc(doc(db, 'players', email));
        if (playerDoc.exists()) {
            return playerDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Error getting player:', error);
        return null;
    }
}

// Get all players from Firestore
async function getAllPlayers() {
    try {
        const playersSnapshot = await getDocs(collection(db, 'players'));
        return playersSnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Error getting all players:', error);
        return [];
    }
}

// Calculate leaderboard from Firestore
async function getLeaderboard() {
    try {
        const players = await getAllPlayers();
        return players
            .map(player => ({
                name: player.name,
                email: player.email,
                completedStages: player.progress.filter(p => p.completed).length,
                totalScore: player.progress.reduce((sum, p) => sum + p.score, 0),
                lastActive: player.lastActive
            }))
            .sort((a, b) => {
                if (b.completedStages !== a.completedStages) {
                    return b.completedStages - a.completedStages;
                }
                return b.totalScore - a.totalScore;
            });
    } catch (error) {
        console.error('Error calculating leaderboard:', error);
        return [];
    }
}

// Export data for admin
async function exportGameData() {
    showLoading(true);
    try {
        const players = await getAllPlayers();
        const gameData = {
            players: players,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(gameData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lybotics_game_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showLoading(false);
        alert('تم تصدير البيانات بنجاح!');
    } catch (error) {
        console.error('Error exporting data:', error);
        showLoading(false);
        alert('حدث خطأ أثناء تصدير البيانات');
    }
}
// ========== المرحلة 8: Password Puzzle ==========
function renderPasswordPuzzleStage(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    
    let html = `
        <div class="special-stage-header">
            <h3>🔐 مرحلة خاصة: لغز الأكواد السرية</h3>
            <p>استخدم معلوماتك من المراحل السابقة لحل الألغاز!</p>
        </div>
    `;
    
    const puzzleSystem = new PasswordPuzzle('challengesContainer');
    
    stage.challenges.forEach((challenge, index) => {
        const isCompleted = stageProgress.completedChallenges.includes(index);
        
        html += `
            <div class="challenge-wrapper" data-challenge="${index}">
                ${puzzleSystem.render(challenge, index)}
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // إضافة event listeners
    document.querySelectorAll('.submit-password-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const challengeIndex = parseInt(e.target.dataset.challenge);
            const challenge = stage.challenges[challengeIndex];
            const input = document.getElementById(`password-${challengeIndex}`);
            const userAnswer = input.value.trim();
            
            if (!userAnswer) {
                alert('الرجاء إدخال الكود السري');
                return;
            }
            
            const isCorrect = puzzleSystem.checkPassword(
                userAnswer, 
                challenge.correctAnswer, 
                challengeIndex
            );
            
            if (isCorrect) {
                await updateChallengeProgress(stage.id, challengeIndex, challenge.points);
            }
        });
    });
}
// ========== المرحلة 9: Platform Game ==========
let currentGame = null;
let currentCodeFix = null;

function renderPlatformGameStage(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    
    let html = `
        <div class="special-stage-header">
            <h3>🎮 مرحلة خاصة: مغامرة LYBOTICS</h3>
            <p>ساعد روبوت بلاكرس في جمع القطع وأصلح الكود!</p>
        </div>
        
        <!-- اللعبة -->
        <div class="game-container">
            <h3>🕹️ التحدي الأول: لعبة المنصات</h3>
            <canvas id="gameCanvas" class="game-canvas" width="800" height="400"></canvas>
            <div class="game-controls">
                <p>استخدم الأسهم ← → للحركة | مسافة ⬆️ للقفز</p>
                <p>اجمع 10 قطع غيار ⚙️</p>
            </div>
            <button class="start-game-btn" id="startGameBtn">بدء اللعبة</button>
        </div>
        
        <!-- تحدي الكود -->
        <div class="code-fix-container" id="codeFix">
            <h3>🐛 التحدي الثاني: أصلح الكود</h3>
            <div class="code-display">
                <pre><code>function moveRobot() {
    if (obstacle_detected) {
        robot.stop();
        // خطأ هنا! ماذا يجب أن يفعل الروبوت؟
    } else {
        robot.moveForward();
    }
}</code></pre>
            </div>
            <p class="code-hint">💡 يجب أن يدور الروبوت يساراً عند وجود عائق!</p>
            <div class="code-input-group">
                <input type="text" 
                       id="code-fix-input" 
                       class="code-input-field"
                       placeholder="robot.turnLeft();"
                       autocomplete="off" />
                <button class="submit-code-btn" id="submitCodeFix">
                    إصلاح الكود
                </button>
            </div>
            <div id="code-feedback" class="feedback-message" style="display: none;"></div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // تهيئة اللعبة
    setTimeout(() => {
        currentGame = new PlatformGame('gameCanvas');
        
        document.getElementById('startGameBtn').addEventListener('click', () => {
            currentGame.start();
            document.getElementById('startGameBtn').textContent = 'اللعبة قيد التشغيل...';
            document.getElementById('startGameBtn').disabled = true;
        });
        
        // تحدي الكود
        document.getElementById('submitCodeFix').addEventListener('click', async () => {
            const userCode = document.getElementById('code-fix-input').value.trim();
            const correctCode = 'robot.turnLeft();';
            const feedback = document.getElementById('code-feedback');
            
            const normalized1 = userCode.toLowerCase().replace(/\s+/g, '');
            const normalized2 = correctCode.toLowerCase().replace(/\s+/g, '');
            
            if (normalized1.includes('turnleft') || normalized1.includes('left')) {
                feedback.className = 'feedback-message success';
                feedback.innerHTML = '✓ أحسنت! الكود يعمل الآن! 🎉';
                feedback.style.display = 'block';
                
                // فتح اللعبة
                if (currentGame) {
                    currentGame.setCodeFixed(true);
                }
                
                // تحديث التقدم
                await updateChallengeProgress(stage.id, 1, 40);
                
            } else {
                feedback.className = 'feedback-message error';
                feedback.innerHTML = '✗ الكود لا يزال به خطأ. حاول مرة أخرى!';
                feedback.style.display = 'block';
            }
        });
        
        // مراقبة الفوز باللعبة
        const checkWin = setInterval(() => {
            if (currentGame && currentGame.gameWon) {
                clearInterval(checkWin);
                updateChallengeProgress(stage.id, 0, 30);
                updateChallengeProgress(stage.id, 2, 30);
                alert('🎉 رائع! أكملت التحدي بنجاح!');
            }
        }, 1000);
        
    }, 100);
}
// ========== المرحلة 10: Robot Lab ==========
let currentRobotLab = null;
let currentSimulation = null;

function renderRobotLabStage(stage, stageProgress) {
    const container = document.getElementById('challengesContainer');
    
    let html = `
        <div class="special-stage-header">
            <h3>🔬 المرحلة النهائية: مختبر الروبوت التفاعلي</h3>
            <p>صمم وبرمج روبوتك الخاص!</p>
        </div>
    `;
    
    container.innerHTML = html;
    
    currentRobotLab = new RobotLab('challengesContainer');
    
    // التحدي 1: اختيار المكونات
    renderRobotComponentSelector(stage.challenges[0]);
}

function renderRobotComponentSelector(challenge) {
    const container = document.getElementById('challengesContainer');
    const lab = currentRobotLab;
    
    container.innerHTML += lab.renderComponentSelector(challenge);
    
    setTimeout(() => {
        lab.setupComponentSelection(challenge);
        
        document.getElementById('submitDesign').addEventListener('click', async () => {
            if (lab.selectedComponents.length >= challenge.minComponents) {
                alert(`✓ تصميم رائع! اخترت: ${lab.selectedComponents.join(', ')}`);
                await updateChallengeProgress(currentStageId, 0, challenge.points);
                
                // الانتقال للتحدي التالي
                renderRobotProgramming();
            }
        });
    }, 100);
}

function renderRobotProgramming() {
    const container = document.getElementById('challengesContainer');
    const stage = stages.find(s => s.id === currentStageId);
    const challenge = stage.challenges[1];
    
    container.innerHTML = `
        <div class="special-stage-header">
            <h3>🔬 المرحلة النهائية: مختبر الروبوت التفاعلي</h3>
        </div>
    ` + currentRobotLab.renderBlockProgramming(challenge);
    
    setTimeout(() => {
        currentRobotLab.setupBlockProgramming();
        
        document.getElementById('runProgram').addEventListener('click', async () => {
            const program = currentRobotLab.programmingBlocks;
            
            if (program.length < 3) {
                alert('أضف على الأقل 3 كتل برمجية!');
                return;
            }
            
            const feedback = document.getElementById('program-feedback');
            feedback.className = 'feedback-message success';
            feedback.innerHTML = '✓ البرنامج يعمل! 🎉';
            feedback.style.display = 'block';
            
            await updateChallengeProgress(currentStageId, 1, challenge.points);
            
            // الانتقال للمحاكاة
            setTimeout(() => {
                renderRobotSimulation();
            }, 2000);
        });
    }, 100);
}

function renderRobotSimulation() {
    const container = document.getElementById('challengesContainer');
    const stage = stages.find(s => s.id === currentStageId);
    const challenge = stage.challenges[2];
    
    container.innerHTML = `
        <div class="special-stage-header">
            <h3>🔬 المرحلة النهائية: مختبر الروبوت التفاعلي</h3>
        </div>
    ` + currentRobotLab.renderSimulation();
    
    setTimeout(() => {
        currentSimulation = new RobotSimulation('robotSimCanvas');
        
        document.getElementById('startSimulation').addEventListener('click', async () => {
            currentSimulation.start(currentRobotLab.programmingBlocks);
            document.getElementById('startSimulation').disabled = true;
            
            // مراقبة النجاح
            const checkSuccess = setInterval(async () => {
                if (currentSimulation.collected >= 5) {
                    clearInterval(checkSuccess);
                    await updateChallengeProgress(currentStageId, 2, challenge.points);
                    
                    setTimeout(() => {
                        renderCreativeChallenge();
                    }, 2000);
                }
            }, 1000);
        });
    }, 100);
}

function renderCreativeChallenge() {
    const container = document.getElementById('challengesContainer');
    const stage = stages.find(s => s.id === currentStageId);
    const challenge = stage.challenges[3];
    
    container.innerHTML = `
        <div class="special-stage-header">
            <h3>🔬 التحدي الإبداعي النهائي!</h3>
        </div>
        <div class="robot-lab-container">
            <h3>🎨 صمم مهمتك الخاصة</h3>
            <p>ماذا تريد أن يفعل روبوتك؟ كن مبدعاً!</p>
            <textarea id="creativeIdea" 
                      style="width: 100%; min-height: 150px; padding: 1rem; 
                             border-radius: 10px; background: rgba(255,255,255,0.05);
                             color: white; font-family: Cairo; border: 2px solid #9b59b6;"
                      placeholder="اكتب فكرتك هنا..."></textarea>
            <button class="submit-design-btn" id="submitCreative">إرسال الفكرة</button>
        </div>
    `;
    
    setTimeout(() => {
        document.getElementById('submitCreative').addEventListener('click', async () => {
            const idea = document.getElementById('creativeIdea').value.trim();
            
            if (idea.length < 20) {
                alert('اكتب فكرة أطول (20 حرف على الأقل)');
                return;
            }
            
            await updateChallengeProgress(currentStageId, 3, challenge.points);
            
            alert('🎉 أحسنت! أكملت جميع تحديات مختبر الروبوت! أنت مبدع حقاً! 🤖✨');
            
            // تحديث عرض المراحل
            renderStages();
        });
    }, 100);
}
// دالة مساعدة لتحديث التقدم
async function updateChallengeProgress(stageId, challengeIndex, points) {
    const stageProgress = currentPlayer.progress.find(p => p.stageId === stageId);
    
    if (!stageProgress.completedChallenges.includes(challengeIndex)) {
        stageProgress.completedChallenges.push(challengeIndex);
        stageProgress.score += points;
    }
    
    // التحقق من اكتمال المرحلة
    const stage = stages.find(s => s.id === stageId);
    if (stageProgress.completedChallenges.length === stage.challenges.length) {
        stageProgress.completed = true;
    }
    
    // حفظ في Firestore
    showLoading(true);
    try {
        await updateDoc(doc(db, 'players', currentPlayer.email), {
            progress: currentPlayer.progress,
            lastActive: new Date().toISOString()
        });
        
        updatePlayerInfo();
        
        if (stageProgress.completed && 
            stageProgress.completedChallenges.length === stage.challenges.length) {
            setTimeout(() => {
                showStageCompletionMessage(stage, stageProgress.score);
            }, 1500);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Error saving progress:', error);
        showLoading(false);
        alert('حدث خطأ أثناء حفظ التقدم');
    }
}
