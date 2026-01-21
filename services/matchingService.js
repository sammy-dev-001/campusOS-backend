/**
 * Study Buddy Matching Service
 * Algorithm to match students based on courses, schedule, and preferences
 */
import StudyBuddy from '../models/StudyBuddy.js';
import StudyBuddyRequest from '../models/StudyBuddyRequest.js';

// Weight factors for matching
const WEIGHTS = {
    SHARED_SUBJECTS: 0.40,      // 40% - Most important
    SCHEDULE_OVERLAP: 0.25,     // 25%
    STUDY_PREFERENCES: 0.20,    // 20%
    SAME_MAJOR: 0.10,           // 10%
    SAME_YEAR: 0.05,            // 5%
};

class MatchingService {
    /**
     * Find potential study buddy matches for a user
     * @param {string} userId - The user's ID
     * @param {number} limit - Maximum number of matches to return
     * @returns {Promise<Array>} - Sorted array of potential matches with scores
     */
    async findMatches(userId, limit = 20) {
        try {
            // Get the user's study preferences
            const userProfile = await StudyBuddy.findOne({ user: userId });

            if (!userProfile) {
                throw new Error('Study profile not found. Please set up your preferences first.');
            }

            // Get existing requests (sent or received) to exclude
            const existingRequests = await StudyBuddyRequest.find({
                $or: [
                    { sender: userId },
                    { receiver: userId },
                ],
                status: { $in: ['pending', 'accepted'] },
            });

            const excludeUserIds = [
                userId,
                ...existingRequests.map(r =>
                    r.sender.toString() === userId ? r.receiver.toString() : r.sender.toString()
                ),
            ];

            // Find active study profiles (excluding current user and existing connections)
            const potentialMatches = await StudyBuddy.find({
                user: { $nin: excludeUserIds },
                isActive: true,
            }).populate('user', 'displayName profilePic username');

            // Calculate match scores
            const scoredMatches = potentialMatches.map(candidate => ({
                profile: candidate,
                score: this.calculateMatchScore(userProfile, candidate),
                sharedSubjects: this.getSharedSubjects(userProfile, candidate),
                scheduleOverlap: this.getScheduleOverlap(userProfile, candidate),
            }));

            // Sort by score and return top matches
            return scoredMatches
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        } catch (error) {
            console.error('Error finding matches:', error);
            throw error;
        }
    }

    /**
     * Calculate match score between two users
     */
    calculateMatchScore(userProfile, candidateProfile) {
        let score = 0;

        // 1. Shared subjects score (40%)
        const sharedSubjectsScore = this.calculateSharedSubjectsScore(userProfile, candidateProfile);
        score += sharedSubjectsScore * WEIGHTS.SHARED_SUBJECTS;

        // 2. Schedule overlap score (25%)
        const scheduleScore = this.calculateScheduleScore(userProfile, candidateProfile);
        score += scheduleScore * WEIGHTS.SCHEDULE_OVERLAP;

        // 3. Study preferences score (20%)
        const preferencesScore = this.calculatePreferencesScore(userProfile, candidateProfile);
        score += preferencesScore * WEIGHTS.STUDY_PREFERENCES;

        // 4. Same major bonus (10%)
        if (userProfile.major && candidateProfile.major &&
            userProfile.major.toLowerCase() === candidateProfile.major.toLowerCase()) {
            score += 100 * WEIGHTS.SAME_MAJOR;
        }

        // 5. Same year bonus (5%)
        if (userProfile.year && candidateProfile.year &&
            userProfile.year === candidateProfile.year) {
            score += 100 * WEIGHTS.SAME_YEAR;
        }

        return Math.round(score);
    }

    /**
     * Calculate shared subjects score
     */
    calculateSharedSubjectsScore(userProfile, candidateProfile) {
        if (!userProfile.subjects?.length || !candidateProfile.subjects?.length) {
            return 0;
        }

        const userSubjects = new Map(
            userProfile.subjects.map(s => [s.courseCode?.toLowerCase(), s])
        );

        let matchCount = 0;
        let complementaryCount = 0;

        for (const candidateSub of candidateProfile.subjects) {
            const userSub = userSubjects.get(candidateSub.courseCode?.toLowerCase());

            if (userSub) {
                matchCount++;

                // Bonus for complementary needs (one needs help, other can help)
                if ((userSub.needHelp && candidateSub.canHelp) ||
                    (userSub.canHelp && candidateSub.needHelp)) {
                    complementaryCount++;
                }
            }
        }

        const baseScore = (matchCount / Math.max(userProfile.subjects.length, 1)) * 70;
        const complementaryBonus = (complementaryCount / Math.max(matchCount, 1)) * 30;

        return Math.min(baseScore + complementaryBonus, 100);
    }

    /**
     * Calculate schedule overlap score
     */
    calculateScheduleScore(userProfile, candidateProfile) {
        if (!userProfile.availability?.length || !candidateProfile.availability?.length) {
            return 50; // Neutral score if no availability set
        }

        let overlapMinutes = 0;
        let totalUserMinutes = 0;

        for (const userSlot of userProfile.availability) {
            const userStart = this.timeToMinutes(userSlot.startTime);
            const userEnd = this.timeToMinutes(userSlot.endTime);
            totalUserMinutes += userEnd - userStart;

            for (const candidateSlot of candidateProfile.availability) {
                if (userSlot.day !== candidateSlot.day) continue;

                const candidateStart = this.timeToMinutes(candidateSlot.startTime);
                const candidateEnd = this.timeToMinutes(candidateSlot.endTime);

                // Calculate overlap
                const overlapStart = Math.max(userStart, candidateStart);
                const overlapEnd = Math.min(userEnd, candidateEnd);

                if (overlapEnd > overlapStart) {
                    overlapMinutes += overlapEnd - overlapStart;
                }
            }
        }

        return totalUserMinutes > 0
            ? Math.min((overlapMinutes / totalUserMinutes) * 100, 100)
            : 50;
    }

    /**
     * Calculate study preferences compatibility
     */
    calculatePreferencesScore(userProfile, candidateProfile) {
        let matches = 0;
        let total = 0;

        // Study style
        if (userProfile.studyStyle && candidateProfile.studyStyle) {
            total++;
            if (userProfile.studyStyle === candidateProfile.studyStyle ||
                userProfile.studyStyle === 'mixed' ||
                candidateProfile.studyStyle === 'mixed') {
                matches++;
            }
        }

        // Group size preference
        if (userProfile.preferredGroupSize && candidateProfile.preferredGroupSize) {
            total++;
            if (userProfile.preferredGroupSize === candidateProfile.preferredGroupSize ||
                userProfile.preferredGroupSize === 'any' ||
                candidateProfile.preferredGroupSize === 'any') {
                matches++;
            }
        }

        // Environment preference
        if (userProfile.preferredEnvironment && candidateProfile.preferredEnvironment) {
            total++;
            if (userProfile.preferredEnvironment === candidateProfile.preferredEnvironment ||
                userProfile.preferredEnvironment === 'anywhere' ||
                candidateProfile.preferredEnvironment === 'anywhere') {
                matches++;
            }
        }

        return total > 0 ? (matches / total) * 100 : 50;
    }

    /**
     * Get shared subjects between two profiles
     */
    getSharedSubjects(userProfile, candidateProfile) {
        if (!userProfile.subjects?.length || !candidateProfile.subjects?.length) {
            return [];
        }

        const userSubjectCodes = new Set(
            userProfile.subjects.map(s => s.courseCode?.toLowerCase())
        );

        return candidateProfile.subjects
            .filter(s => userSubjectCodes.has(s.courseCode?.toLowerCase()))
            .map(s => ({ courseCode: s.courseCode, name: s.name }));
    }

    /**
     * Get schedule overlap summary
     */
    getScheduleOverlap(userProfile, candidateProfile) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const overlaps = [];

        if (!userProfile.availability?.length || !candidateProfile.availability?.length) {
            return overlaps;
        }

        for (const userSlot of userProfile.availability) {
            for (const candidateSlot of candidateProfile.availability) {
                if (userSlot.day !== candidateSlot.day) continue;

                const userStart = this.timeToMinutes(userSlot.startTime);
                const userEnd = this.timeToMinutes(userSlot.endTime);
                const candidateStart = this.timeToMinutes(candidateSlot.startTime);
                const candidateEnd = this.timeToMinutes(candidateSlot.endTime);

                const overlapStart = Math.max(userStart, candidateStart);
                const overlapEnd = Math.min(userEnd, candidateEnd);

                if (overlapEnd > overlapStart) {
                    overlaps.push({
                        day: days[userSlot.day],
                        startTime: this.minutesToTime(overlapStart),
                        endTime: this.minutesToTime(overlapEnd),
                    });
                }
            }
        }

        return overlaps;
    }

    /**
     * Convert time string to minutes
     */
    timeToMinutes(time) {
        if (!time) return 0;
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Convert minutes to time string
     */
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
}

export const matchingService = new MatchingService();
export default matchingService;
