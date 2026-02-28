-- Run once in the Supabase SQL editor to create the table,
-- register the RPC helper, and seed 200 sample questions.

-- 1. Table
CREATE TABLE IF NOT EXISTS sample_questions (
    id   serial PRIMARY KEY,
    text text NOT NULL
);

-- 2. RPC helper — used by /api/questions/random
CREATE OR REPLACE FUNCTION get_random_questions()
RETURNS TABLE(question_text text)
LANGUAGE sql STABLE AS $$
    SELECT text AS question_text
    FROM sample_questions
    ORDER BY RANDOM()
    LIMIT 3;
$$;

-- 3. Seed — 200 on-topic questions
INSERT INTO sample_questions (text) VALUES

-- Desert Fathers / Sayings of the Fathers
('What did the desert fathers say about humility?'),
('What did Abba Moses teach about staying in one''s cell?'),
('How did the desert fathers describe the danger of idle speech?'),
('What did Abba Antony say about the warfare of demons?'),
('What do the sayings of the desert fathers teach about judging others?'),
('How did the desert fathers describe inner peace and stillness?'),
('What did Abba Poemen say about bearing one''s own faults?'),
('What do the desert fathers teach about guarding one''s thoughts?'),
('How did the desert fathers describe holy weeping and compunction?'),
('What did the desert fathers say about the value of manual labor?'),
('What did Abba Arsenius teach about silence and solitude?'),
('How did the desert fathers describe the virtue of discretion?'),
('What do the sayings of the desert fathers teach about anger?'),
('What did the desert fathers say about hospitality toward strangers?'),
('What advice did Abba John the Dwarf give about patience?'),
('How did the desert fathers describe the virtue of simplicity?'),
('What did the desert fathers say about charity toward the poor?'),
('How did Abba Sisoes describe true repentance?'),
('What do the desert fathers teach about resisting vainglory?'),
('What did the desert fathers say about perseverance in prayer?'),

-- Prayer and contemplation
('What does scripture say about prayer?'),
('What did the saints say about distractions in prayer?'),
('How do the saints describe the gift of contemplative prayer?'),
('What did the saints teach about dry spells and spiritual desolation?'),
('What do the saints say about the importance of daily prayer?'),
('How do the saints describe listening to God in silence?'),
('What did the saints say about persevering in prayer when it feels fruitless?'),
('What do the saints teach about vocal prayer versus mental prayer?'),
('How do the saints describe the Our Father as a model of prayer?'),
('What did the saints say about praying with scripture?'),
('What do the saints teach about interceding for others?'),
('How did the saints describe the experience of consolation in prayer?'),
('What do the saints say about praying at fixed hours of the day?'),
('What did the saints teach about the prayer of quiet?'),
('How do the saints describe the role of gratitude in prayer?'),

-- Suffering, patience and the cross
('What did the saints say about suffering and patience?'),
('How do the saints describe the purpose of trials and hardships?'),
('What do the saints teach about carrying one''s cross?'),
('What did the saints say about the redemptive value of suffering?'),
('How do the saints describe the virtue of fortitude in adversity?'),
('What did the saints teach about accepting illness with peace?'),
('How do the saints describe the spiritual fruit of interior suffering?'),
('What did the saints say about conforming one''s will to God in trials?'),
('What do the saints teach about perseverance under temptation?'),
('How did the saints describe the connection between suffering and love?'),

-- Humility and pride
('How do the saints describe true humility?'),
('What do the saints teach about the danger of pride?'),
('How did the saints describe the difference between false and true humility?'),
('What did the saints say about self-knowledge as the root of humility?'),
('How do the saints describe the spiritual harm of vanity and vainglory?'),
('What do the saints teach about humility toward God versus humility toward neighbor?'),
('How did the saints describe the grace that flows from humility?'),
('What did the saints say about accepting correction and reproach?'),
('How do the saints describe the humility of Mary as a model?'),
('What did the saints teach about seeking the lowest place?'),

-- Charity and love of neighbor
('What did the saints say about the love of neighbor?'),
('How do the saints describe charity as the greatest virtue?'),
('What do the saints teach about caring for the poor?'),
('How did the saints describe works of mercy?'),
('What did the saints say about bearing with the faults of others?'),
('How do the saints describe the connection between love of God and love of neighbor?'),
('What did the saints teach about forgiveness and reconciliation?'),
('How did the saints describe love for one''s enemies?'),
('What do the saints say about the duty to visit the sick and imprisoned?'),
('How did the saints describe almsgiving and its spiritual reward?'),

-- Fasting and mortification
('What did the Church Fathers teach about fasting?'),
('How do the saints describe the purpose of bodily mortification?'),
('What did the saints say about fasting in secret?'),
('How did the saints describe the connection between fasting and prayer?'),
('What do the saints teach about moderation in food and drink?'),
('How did the saints describe mortification of the senses?'),
('What did the saints say about the spiritual danger of gluttony?'),
('How do the saints describe the fruit of voluntary penance?'),
('What did the saints teach about corporal penances and their limits?'),
('How did the saints describe fasting as a weapon against temptation?'),

-- Virtue and the moral life
('What do the saints teach about the four cardinal virtues?'),
('How do the saints describe the virtue of prudence?'),
('What did the saints say about justice in daily dealings?'),
('How do the saints describe temperance in the spiritual life?'),
('What did the saints teach about cultivating good habits?'),
('How do the saints describe the struggle against the capital sins?'),
('What did the saints say about the virtue of chastity?'),
('How did the saints describe the connection between virtue and grace?'),
('What do the saints teach about holy zeal for souls?'),
('How did the saints describe the spiritual life as ongoing conversion?'),

-- Augustine
('What does Augustine say about the restlessness of the heart seeking God?'),
('How does Augustine describe his conversion experience?'),
('What does Augustine teach about the nature of sin and concupiscence?'),
('How does Augustine describe the beauty of God?'),
('What does Augustine say about memory and the soul''s search for God?'),
('How does Augustine reflect on the role of grace in salvation?'),
('What does Augustine teach about time and eternity?'),
('How does Augustine describe his mother Monica''s persevering faith?'),
('What does Augustine say about the role of friendship in the spiritual life?'),
('How does Augustine describe the proper ordering of love?'),
('What does Augustine teach about the interior life and self-examination?'),
('How does Augustine describe the restlessness of the soul apart from God?'),

-- Francis de Sales
('What does Francis de Sales say about practising devotion in daily life?'),
('How does Francis de Sales describe mental prayer?'),
('What does Francis de Sales teach about gentleness toward oneself?'),
('How does Francis de Sales describe holy indifference to God''s will?'),
('What does Francis de Sales say about the dangers of certain friendships?'),
('How does Francis de Sales describe the examination of conscience?'),
('What does Francis de Sales teach about humility and self-contempt?'),
('How does Francis de Sales describe consolations and dryness in prayer?'),
('What does Francis de Sales say about serving God in one''s state of life?'),
('How does Francis de Sales describe the little virtues?'),
('What does Francis de Sales teach about patience with oneself?'),
('How does Francis de Sales describe the devout life for those in the world?'),

-- John Chrysostom
('What does John Chrysostom teach about almsgiving?'),
('How does Chrysostom describe the proper use of wealth?'),
('What does Chrysostom say about the danger of vainglory?'),
('How does Chrysostom describe the duty to care for the poor?'),
('What does Chrysostom teach about the Eucharist?'),
('How does Chrysostom describe the responsibilities of those in authority?'),
('What does Chrysostom say about anger and its remedy?'),
('How does Chrysostom describe the spiritual power of gratitude?'),
('What does Chrysostom teach about bearing wrongs patiently?'),
('How does Chrysostom describe the danger of worldly attachment?'),

-- Basil the Great and the Cappadocians
('What does Basil the Great say about community life and fraternal charity?'),
('How does Basil describe the nature and purpose of prayer?'),
('What does Basil the Great teach about fasting?'),
('How does Gregory of Nyssa describe the soul''s ascent to God?'),
('What does Basil say about work and contemplation in the monastic life?'),
('How does Gregory of Nazianzus describe the mystery of the Trinity?'),
('What does Basil teach about love for the poor?'),
('How does Gregory of Nyssa describe perfection as infinite progress in God?'),

-- Medieval mystics and scholastics
('What does Bernard of Clairvaux say about loving God?'),
('How does Bernard describe the stages of humility?'),
('What does Bernard teach about contemplative prayer and union with God?'),
('How does Thomas Aquinas describe the nature of charity?'),
('What does Thomas Aquinas say about the beatific vision?'),
('How does Thomas Aquinas describe the relationship between faith and reason?'),
('What does Francis of Assisi teach about poverty and simplicity?'),
('How does Francis of Assisi describe peace and fraternal charity?'),
('What does Bonaventure teach about the soul''s journey to God?'),
('How does Bernard describe the spiritual meaning of the Song of Songs?'),

-- Death, judgment and eternal life
('What did the saints say about death and eternal life?'),
('How do the saints describe the four last things: death, judgment, heaven, and hell?'),
('What did the saints teach about preparing well for a holy death?'),
('How did the saints describe the mercy of God at the hour of death?'),
('What did the saints say about praying for the souls in purgatory?'),
('How did the saints describe the joy of heaven?'),
('What do the saints teach about detachment as preparation for death?'),
('How did the saints describe the particular judgment?'),
('What did the saints say about the importance of a good death?'),
('How do the saints describe the bond between the living and the dead in Christ?'),

-- Scripture and the word of God
('What do the saints say about reading and meditating on Holy Scripture?'),
('How did the Fathers describe the spiritual interpretation of the Psalms?'),
('What did the saints teach about lectio divina?'),
('How did the Church Fathers describe the living power of the word of God?'),
('What do the saints say about the Beatitudes and their meaning?'),
('How did the Fathers describe the parable of the Prodigal Son?'),
('What do the saints teach about the Sermon on the Mount?'),
('How did the Fathers describe the significance of the Incarnation?'),

-- Providence and trust in God
('What do the saints say about trusting in divine providence?'),
('How do the saints describe abandonment to God''s will?'),
('What did the saints teach about peace of soul in uncertainty?'),
('How do the saints describe holy abandonment in suffering?'),
('What did the saints say about seeking God''s will in all things?'),
('How do the saints describe the grace of accepting what God permits?'),
('What did the saints teach about acting with diligence while trusting God?'),
('How did the saints describe finding God in the present moment?'),

-- Joy, gratitude and spiritual consolation
('What do the saints teach about joy as a fruit of the Holy Spirit?'),
('How do the saints describe holy cheerfulness and spiritual joy?'),
('What did the saints say about the gift of consolation in prayer?'),
('How did the saints describe gratitude as a spiritual virtue?'),
('What do the saints teach about rejoicing in the Lord always?'),
('How did the saints describe interior peace as a sign of God''s presence?'),
('What did the saints say about the joy of serving God in small things?'),

-- Repentance and confession
('How do the saints describe true repentance?'),
('What did the saints teach about the sacrament of confession?'),
('How do the saints describe the mercy of God toward sinners?'),
('What did the saints say about frequent examination of conscience?'),
('How did the saints describe sorrow for sin that leads to conversion?'),
('What do the saints teach about the difference between contrition and attrition?'),
('How did the saints describe the healing of the soul through penance?'),

-- Detachment and simplicity
('How do the saints describe holy detachment from worldly things?'),
('What did the saints say about the love of poverty in spirit?'),
('How do the saints describe the danger of excessive attachment to created goods?'),
('What did the saints teach about simplicity of life?'),
('How did the saints describe freeing the heart for God alone?'),
('What do the saints say about not being enslaved to comfort or ease?'),
('How did the saints describe the freedom that comes from detachment?');
