-- ============================================================
-- GIZMO Database Schema
-- Study + Trivia app (users, quizzes, multiplayer, flashcards)
-- Run via phpMyAdmin or: mysql -u root < database/gizmo.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `GIZMO`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `GIZMO`;

-- ------------------------------------------------------------
-- USERS & STATS (login, dashboard, streaks)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            CHAR(40)     NOT NULL COMMENT 'SHA1 email or UUID',
  `name`          VARCHAR(24)  NOT NULL,
  `email`         VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'NULL for Google-only accounts',
  `photo`         MEDIUMTEXT   DEFAULT NULL COMMENT 'Base64 or URL',
  `google_id`     VARCHAR(128) DEFAULT NULL,
  `total_score`   INT UNSIGNED NOT NULL DEFAULT 0,
  `total_games`   INT UNSIGNED NOT NULL DEFAULT 0,
  `correct`       INT UNSIGNED NOT NULL DEFAULT 0,
  `answers`       INT UNSIGNED NOT NULL DEFAULT 0,
  `streak`        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Consecutive days played',
  `last_played`   DATE         DEFAULT NULL,
  `joined_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_score` (`total_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- SOCIAL (follow / followers — profiles.php, dashboard)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_follows` (
  `follower_id`  CHAR(40)  NOT NULL,
  `following_id` CHAR(40)  NOT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`follower_id`, `following_id`),
  KEY `idx_following` (`following_id`),
  CONSTRAINT `fk_follow_follower`  FOREIGN KEY (`follower_id`)  REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_follow_following` FOREIGN KEY (`following_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_known_players` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       CHAR(40)     NOT NULL,
  `known_user_id` CHAR(40)     DEFAULT NULL,
  `known_name`    VARCHAR(24)  DEFAULT NULL COMMENT 'Guest name from multiplayer',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_known_user` (`user_id`, `known_user_id`),
  UNIQUE KEY `uq_known_name` (`user_id`, `known_name`),
  KEY `idx_known_target` (`known_user_id`),
  CONSTRAINT `fk_known_user`   FOREIGN KEY (`user_id`)       REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_known_target` FOREIGN KEY (`known_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- QUIZ CATEGORIES & QUESTIONS (game.js / multiplayer.php)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quiz_categories` (
  `id`    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`  VARCHAR(20)      NOT NULL COMMENT 'world, science, fun',
  `title` VARCHAR(60)      NOT NULL,
  `icon`  VARCHAR(8)       NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `quiz_questions` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `category_id` TINYINT UNSIGNED NOT NULL,
  `question`    VARCHAR(255)     NOT NULL,
  `sort_order`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_questions_category` (`category_id`, `sort_order`),
  CONSTRAINT `fk_questions_category` FOREIGN KEY (`category_id`) REFERENCES `quiz_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `quiz_options` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `question_id` INT UNSIGNED NOT NULL,
  `option_text` VARCHAR(120) NOT NULL,
  `option_index` TINYINT UNSIGNED NOT NULL COMMENT '0=A, 1=B, 2=C, 3=D',
  `is_correct`  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_option_per_question` (`question_id`, `option_index`),
  CONSTRAINT `fk_options_question` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- MULTIPLAYER ROOMS (multiplayer.php)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rooms` (
  `id`         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `room_code`  CHAR(6)          NOT NULL,
  `category_id` TINYINT UNSIGNED NOT NULL,
  `host_id`    VARCHAR(32)      DEFAULT NULL COMMENT 'room_players.id of host',
  `status`     ENUM('lobby','started','finished') NOT NULL DEFAULT 'lobby',
  `created_at` INT UNSIGNED     NOT NULL COMMENT 'Unix timestamp',
  `started_at` INT UNSIGNED     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_room_code` (`room_code`),
  KEY `idx_rooms_status` (`status`, `created_at`),
  CONSTRAINT `fk_rooms_category` FOREIGN KEY (`category_id`) REFERENCES `quiz_categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_custom_quizzes` (
  `room_id`        INT UNSIGNED NOT NULL,
  `title`          VARCHAR(120) NOT NULL,
  `questions_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`room_id`),
  CONSTRAINT `fk_custom_quiz_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_players` (
  `id`              VARCHAR(32)  NOT NULL COMMENT 'Hex session id from multiplayer.php',
  `room_id`         INT UNSIGNED NOT NULL,
  `user_id`         CHAR(40)     DEFAULT NULL COMMENT 'Linked account if logged in',
  `name`            VARCHAR(24)  NOT NULL,
  `score`           INT UNSIGNED NOT NULL DEFAULT 0,
  `correct`         INT UNSIGNED NOT NULL DEFAULT 0,
  `streak`          INT UNSIGNED NOT NULL DEFAULT 0,
  `best_streak`     INT UNSIGNED NOT NULL DEFAULT 0,
  `answered_round`  SMALLINT     NOT NULL DEFAULT -1,
  `round`           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `joined_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_players_room` (`room_id`),
  KEY `idx_room_players_user` (`user_id`),
  CONSTRAINT `fk_room_players_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_room_players_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_player_characters` (
  `player_id`      VARCHAR(32) NOT NULL,
  `character_key` VARCHAR(24) NOT NULL DEFAULT 'profile',
  PRIMARY KEY (`player_id`),
  CONSTRAINT `fk_character_player` FOREIGN KEY (`player_id`) REFERENCES `room_players` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_answers` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_player_id` VARCHAR(32) NOT NULL,
  `round_number`  TINYINT UNSIGNED NOT NULL,
  `answer_index`  TINYINT UNSIGNED NOT NULL,
  `is_correct`    TINYINT(1)   NOT NULL,
  `answered_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_player_round` (`room_player_id`, `round_number`),
  CONSTRAINT `fk_answers_player` FOREIGN KEY (`room_player_id`) REFERENCES `room_players` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- STUDY SETS / FLASHCARDS (study.js)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `study_sets` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    CHAR(40)     NOT NULL,
  `title`      VARCHAR(120) NOT NULL DEFAULT 'My study set',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_study_sets_user` (`user_id`),
  CONSTRAINT `fk_study_sets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `study_cards` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `study_set_id` INT UNSIGNED NOT NULL,
  `question`     TEXT         NOT NULL,
  `answer`       TEXT         NOT NULL,
  `sort_order`   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cards_set` (`study_set_id`, `sort_order`),
  CONSTRAINT `fk_cards_set` FOREIGN KEY (`study_set_id`) REFERENCES `study_sets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `study_quiz_results` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         CHAR(40)     NOT NULL,
  `study_set_id`    INT UNSIGNED NOT NULL,
  `score`           INT UNSIGNED NOT NULL COMMENT 'Correct answers count',
  `total_questions` INT UNSIGNED NOT NULL,
  `cards_known`     INT UNSIGNED NOT NULL DEFAULT 0,
  `completed_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_study_results_user` (`user_id`),
  CONSTRAINT `fk_study_results_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_study_results_set`  FOREIGN KEY (`study_set_id`) REFERENCES `study_sets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- GAME SESSION LOG (solo trivia history — optional tracking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `game_sessions` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `user_id`     CHAR(40)         DEFAULT NULL,
  `category_id` TINYINT UNSIGNED NOT NULL,
  `score`       INT UNSIGNED     NOT NULL DEFAULT 0,
  `correct`     INT UNSIGNED     NOT NULL DEFAULT 0,
  `total`       TINYINT UNSIGNED NOT NULL DEFAULT 15,
  `played_at`   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sessions_category` FOREIGN KEY (`category_id`) REFERENCES `quiz_categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA: Categories
-- ============================================================
INSERT INTO `quiz_categories` (`slug`, `title`, `icon`) VALUES
  ('world',   'World Trivia',   '🌍'),
  ('science', 'Science Trivia', '🧠'),
  ('fun',     'Fun Trivia',     '🎬');

-- ============================================================
-- SEED DATA: World Trivia (15 questions)
-- Correct indices: 1,2,1,1,2,1,2,2,1,1,1,2,0,2,1
-- ============================================================
INSERT INTO `quiz_questions` (`category_id`, `question`, `sort_order`) VALUES
  (1, 'Largest ocean?', 1),
  (1, 'Pyramids of Giza are in?', 2),
  (1, 'Capital of Japan?', 3),
  (1, 'Sahara is in?', 4),
  (1, 'Red Planet?', 5),
  (1, 'Paris is in?', 6),
  (1, 'Everest range?', 7),
  (1, 'Capital of Australia?', 8),
  (1, 'Brazil is in?', 9),
  (1, 'Longest river?', 10),
  (1, 'Boot-shaped country?', 11),
  (1, 'Ocean east of Africa?', 12),
  (1, 'Great Barrier Reef?', 13),
  (1, 'Smallest continent?', 14),
  (1, 'Big Apple city?', 15);

INSERT INTO `quiz_options` (`question_id`, `option_text`, `option_index`, `is_correct`) VALUES
  (1,  'Atlantic', 0, 0), (1,  'Pacific', 1, 1), (1,  'Indian', 2, 0), (1,  'Arctic', 3, 0),
  (2,  'Mexico', 0, 0), (2,  'Greece', 1, 0), (2,  'Egypt', 2, 1), (2,  'Italy', 3, 0),
  (3,  'Kyoto', 0, 0), (3,  'Tokyo', 1, 1), (3,  'Osaka', 2, 0), (3,  'Seoul', 3, 0),
  (4,  'Asia', 0, 0), (4,  'Africa', 1, 1), (4,  'Australia', 2, 0), (4,  'Europe', 3, 0),
  (5,  'Venus', 0, 0), (5,  'Jupiter', 1, 0), (5,  'Mars', 2, 1), (5,  'Mercury', 3, 0),
  (6,  'Spain', 0, 0), (6,  'France', 1, 1), (6,  'Italy', 2, 0), (6,  'Germany', 3, 0),
  (7,  'Andes', 0, 0), (7,  'Alps', 1, 0), (7,  'Himalayas', 2, 1), (7,  'Rockies', 3, 0),
  (8,  'Sydney', 0, 0), (8,  'Melbourne', 1, 0), (8,  'Canberra', 2, 1), (8,  'Perth', 3, 0),
  (9,  'Africa', 0, 0), (9,  'South America', 1, 1), (9,  'Europe', 2, 0), (9,  'Asia', 3, 0),
  (10, 'Amazon', 0, 0), (10, 'Nile', 1, 1), (10, 'Yangtze', 2, 0), (10, 'Mississippi', 3, 0),
  (11, 'Greece', 0, 0), (11, 'Italy', 1, 1), (11, 'Portugal', 2, 0), (11, 'Chile', 3, 0),
  (12, 'Pacific', 0, 0), (12, 'Arctic', 1, 0), (12, 'Indian', 2, 1), (12, 'Atlantic', 3, 0),
  (13, 'Australia', 0, 1), (13, 'Indonesia', 1, 0), (13, 'Philippines', 2, 0), (13, 'India', 3, 0),
  (14, 'Europe', 0, 0), (14, 'Antarctica', 1, 0), (14, 'Australia', 2, 1), (14, 'South America', 3, 0),
  (15, 'Los Angeles', 0, 0), (15, 'New York', 1, 1), (15, 'Chicago', 2, 0), (15, 'Boston', 3, 0);

-- ============================================================
-- SEED DATA: Science Trivia (15 questions)
-- Correct indices: 1,1,2,2,0,1,2,1,2,1,2,1,1,2,0
-- ============================================================
INSERT INTO `quiz_questions` (`category_id`, `question`, `sort_order`) VALUES
  (2, 'Plants absorb?', 1),
  (2, 'Adult bones?', 2),
  (2, 'Force toward Earth?', 3),
  (2, 'Organ that pumps blood?', 4),
  (2, 'Water freezes at?', 5),
  (2, 'H2O is?', 6),
  (2, 'Closest planet to Sun?', 7),
  (2, 'Plant part absorbing water?', 8),
  (2, 'Sense using ears?', 9),
  (2, 'Bees collect?', 10),
  (2, 'A mammal?', 11),
  (2, 'Insect legs?', 12),
  (2, 'Atom center?', 13),
  (2, 'Magnetic material?', 14),
  (2, 'Why sky seems blue?', 15);

INSERT INTO `quiz_options` (`question_id`, `option_text`, `option_index`, `is_correct`) VALUES
  (16, 'Oxygen', 0, 0), (16, 'Carbon dioxide', 1, 1), (16, 'Nitrogen', 2, 0), (16, 'Helium', 3, 0),
  (17, '106', 0, 0), (17, '206', 1, 1), (17, '306', 2, 0), (17, '406', 3, 0),
  (18, 'Magnetism', 0, 0), (18, 'Friction', 1, 0), (18, 'Gravity', 2, 1), (18, 'Electricity', 3, 0),
  (19, 'Lungs', 0, 0), (19, 'Brain', 1, 0), (19, 'Heart', 2, 1), (19, 'Liver', 3, 0),
  (20, '0°', 0, 1), (20, '10°', 1, 0), (20, '32°', 2, 0), (20, '100°', 3, 0),
  (21, 'Salt', 0, 0), (21, 'Water', 1, 1), (21, 'Oxygen', 2, 0), (21, 'Hydrogen', 3, 0),
  (22, 'Venus', 0, 0), (22, 'Earth', 1, 0), (22, 'Mercury', 2, 1), (22, 'Mars', 3, 0),
  (23, 'Leaves', 0, 0), (23, 'Roots', 1, 1), (23, 'Flowers', 2, 0), (23, 'Stem', 3, 0),
  (24, 'Sight', 0, 0), (24, 'Taste', 1, 0), (24, 'Hearing', 2, 1), (24, 'Smell', 3, 0),
  (25, 'Sand', 0, 0), (25, 'Nectar', 1, 1), (25, 'Snow', 2, 0), (25, 'Oil', 3, 0),
  (26, 'Shark', 0, 0), (26, 'Frog', 1, 0), (26, 'Whale', 2, 1), (26, 'Lizard', 3, 0),
  (27, '4', 0, 0), (27, '6', 1, 1), (27, '8', 2, 0), (27, '10', 3, 0),
  (28, 'Cell', 0, 0), (28, 'Nucleus', 1, 1), (28, 'Orbit', 2, 0), (28, 'Shell', 3, 0),
  (29, 'Wood', 0, 0), (29, 'Plastic', 1, 0), (29, 'Iron', 2, 1), (29, 'Glass', 3, 0),
  (30, 'Sunlight scattering', 0, 1), (30, 'Clouds', 1, 0), (30, 'Ocean', 2, 0), (30, 'Stars', 3, 0);

-- ============================================================
-- SEED DATA: Fun Trivia (15 questions)
-- Correct indices: 2,1,1,2,1,1,2,1,2,1,2,1,2,0,2
-- ============================================================
INSERT INTO `quiz_questions` (`category_id`, `question`, `sort_order`) VALUES
  (3, 'Rainbow colors?', 1),
  (3, 'Instrument with 88 keys?', 2),
  (3, 'Toy Story cowboy?', 3),
  (3, 'Sport with shuttlecock?', 4),
  (3, 'Fastest land animal?', 5),
  (3, 'Sport with black-white ball?', 6),
  (3, 'Blue + yellow?', 7),
  (3, 'Animal that meows?', 8),
  (3, 'Days in a week?', 9),
  (3, 'After June?', 10),
  (3, 'Baby dog?', 11),
  (3, 'Yellow curved fruit?', 12),
  (3, '5 + 7?', 13),
  (3, 'Pumpkin holiday?', 14),
  (3, 'Three-sided shape?', 15);

INSERT INTO `quiz_options` (`question_id`, `option_text`, `option_index`, `is_correct`) VALUES
  (31, '5', 0, 0), (31, '6', 1, 0), (31, '7', 2, 1), (31, '8', 3, 0),
  (32, 'Guitar', 0, 0), (32, 'Piano', 1, 1), (32, 'Violin', 2, 0), (32, 'Drums', 3, 0),
  (33, 'Buzz', 0, 0), (33, 'Woody', 1, 1), (33, 'Rex', 2, 0), (33, 'Andy', 3, 0),
  (34, 'Tennis', 0, 0), (34, 'Baseball', 1, 0), (34, 'Badminton', 2, 1), (34, 'Golf', 3, 0),
  (35, 'Lion', 0, 0), (35, 'Cheetah', 1, 1), (35, 'Horse', 2, 0), (35, 'Falcon', 3, 0),
  (36, 'Basketball', 0, 0), (36, 'Soccer', 1, 1), (36, 'Baseball', 2, 0), (36, 'Golf', 3, 0),
  (37, 'Purple', 0, 0), (37, 'Orange', 1, 0), (37, 'Green', 2, 1), (37, 'Red', 3, 0),
  (38, 'Dog', 0, 0), (38, 'Cat', 1, 1), (38, 'Cow', 2, 0), (38, 'Horse', 3, 0),
  (39, '5', 0, 0), (39, '6', 1, 0), (39, '7', 2, 1), (39, '8', 3, 0),
  (40, 'May', 0, 0), (40, 'July', 1, 1), (40, 'August', 2, 0), (40, 'April', 3, 0),
  (41, 'Kitten', 0, 0), (41, 'Calf', 1, 0), (41, 'Puppy', 2, 1), (41, 'Foal', 3, 0),
  (42, 'Apple', 0, 0), (42, 'Banana', 1, 1), (42, 'Grape', 2, 0), (42, 'Cherry', 3, 0),
  (43, '10', 0, 0), (43, '11', 1, 0), (43, '12', 2, 1), (43, '13', 3, 0),
  (44, 'Halloween', 0, 1), (44, 'New Year', 1, 0), (44, 'Valentine''s', 2, 0), (44, 'Easter', 3, 0),
  (45, 'Square', 0, 0), (45, 'Circle', 1, 0), (45, 'Triangle', 2, 1), (45, 'Rectangle', 3, 0);
