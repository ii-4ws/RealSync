import { motion } from 'framer-motion';
import { Crown, Code2, Cpu, Shield, GraduationCap } from 'lucide-react';
import BackgroundLayers from './BackgroundLayers';
import { BorderBeam } from '@/components/ui/border-beam';

interface TeamMember {
  name: string;
  role: string;
  initials: string;
  focus: string;
  icon: typeof Crown;
  accentColor: string;
  glowColor: string;
  isLeader?: boolean;
  isSupervisor?: boolean;
}

const members: TeamMember[] = [
  {
    name: 'Ahmed Sarhan',
    role: 'Project Leader',
    initials: 'AS',
    focus: 'Architecture & AI Pipeline',
    icon: Crown,
    accentColor: '#3B82F6',
    glowColor: 'rgba(59,130,246,0.15)',
    isLeader: true,
  },
  {
    name: 'Mohammed Atwani',
    role: 'Developer',
    initials: 'MA',
    focus: 'AI & Detection Models',
    icon: Cpu,
    accentColor: '#F59E0B',
    glowColor: 'rgba(245,158,11,0.15)',
  },
  {
    name: 'Mohamed Ghazi',
    role: 'Developer',
    initials: 'MG',
    focus: 'Frontend & Backend',
    icon: Code2,
    accentColor: '#22D3EE',
    glowColor: 'rgba(34,211,238,0.15)',
  },
  {
    name: 'Yousef Kanjo',
    role: 'Developer',
    initials: 'YK',
    focus: 'Testing & Deployment',
    icon: Shield,
    accentColor: '#10B981',
    glowColor: 'rgba(16,185,129,0.15)',
  },
  {
    name: 'Aws Diab',
    role: 'Developer',
    initials: 'AD',
    focus: 'Backend & Integration',
    icon: Code2,
    accentColor: '#A855F7',
    glowColor: 'rgba(168,85,247,0.15)',
  },
];

const supervisor: TeamMember = {
  name: 'Dr. May El Barachi',
  role: 'Project Supervisor',
  initials: 'MB',
  focus: 'University of Wollongong in Dubai',
  icon: GraduationCap,
  accentColor: '#22D3EE',
  glowColor: 'rgba(34,211,238,0.15)',
  isSupervisor: true,
};

/* ── Gradient avatar ring ─────────────────────────────────── */

function GradientAvatar({
  initials,
  size = 'md',
  accentColor,
}: {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  accentColor: string;
}) {
  const sizeClasses = {
    sm: 'w-14 h-14',
    md: 'w-20 h-20',
    lg: 'w-28 h-28',
  };
  const textClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className="relative">
      {/* Outer gradient ring */}
      <div
        className={`${sizeClasses[size]} rounded-full p-[2px]`}
        style={{
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}44, ${accentColor})`,
        }}
      >
        {/* Inner dark circle */}
        <div className="w-full h-full rounded-full bg-[#0D1117] grid place-items-center">
          <span
            className={`font-mono ${textClasses[size]} font-bold tracking-widest select-none leading-none`}
            style={{ color: accentColor, marginRight: '-0.1em' }}
          >
            {initials}
          </span>
        </div>
      </div>
      {/* Ambient glow behind avatar */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-30 -z-10"
        style={{ background: accentColor }}
      />
    </div>
  );
}

/* ── Leader card (featured, wide) ────────────────────────── */

function LeaderCard({ member }: { member: TeamMember }) {
  const Icon = member.icon;

  return (
    <motion.div
      className="relative rounded-2xl border border-white/[0.06] bg-[#0D1117]/60 backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <BorderBeam
        size={120}
        duration={8}
        colorFrom="#3B82F6"
        colorTo="#22D3EE"
        borderWidth={1.5}
      />

      <div className="p-8 md:p-10 flex flex-col sm:flex-row items-center gap-8">
        <GradientAvatar
          initials={member.initials}
          size="lg"
          accentColor={member.accentColor}
        />

        <div className="text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-2">
            <Icon className="w-4 h-4" style={{ color: member.accentColor }} />
            <span
              className="font-mono text-[10px] font-medium tracking-[0.2em] uppercase"
              style={{ color: member.accentColor }}
            >
              {member.role}
            </span>
          </div>
          <h3 className="font-headline text-2xl md:text-3xl font-bold text-[#E6EDF3] mb-2">
            {member.name}
          </h3>
          <p className="font-body text-[#8B949E] text-sm">{member.focus}</p>
        </div>

        {/* Right side stats on desktop */}
        <div className="hidden md:flex flex-col gap-3">
          {[
            { label: 'Commits', value: '200+' },
            { label: 'Focus', value: 'Full Stack' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center px-5 py-3 rounded-xl border border-white/[0.06] bg-[#0D1117]/80"
            >
              <div className="font-mono text-sm font-bold text-[#E6EDF3]">
                {stat.value}
              </div>
              <div className="font-mono text-[9px] text-[#484F58] uppercase tracking-wider mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Team member card ────────────────────────────────────── */

function MemberCard({
  member,
  index,
}: {
  member: TeamMember;
  index: number;
}) {
  const Icon = member.icon;

  return (
    <motion.div
      className="group relative rounded-2xl border border-white/[0.06] bg-[#0D1117]/60 backdrop-blur-sm p-6 md:p-8 transition-all duration-500 hover:border-white/[0.12]"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: `radial-gradient(400px circle at 50% 0%, ${member.glowColor}, transparent 70%)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        <GradientAvatar
          initials={member.initials}
          size="md"
          accentColor={member.accentColor}
        />

        <div className="mt-5">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Icon
              className="w-3.5 h-3.5"
              style={{ color: member.accentColor }}
            />
            <span
              className="font-mono text-[9px] font-medium tracking-[0.2em] uppercase"
              style={{ color: member.accentColor }}
            >
              {member.role}
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold text-[#E6EDF3] mb-1">
            {member.name}
          </h3>
          <p className="font-body text-xs text-[#484F58]">{member.focus}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Supervisor card ─────────────────────────────────────── */

function SupervisorCard() {
  const Icon = supervisor.icon;

  return (
    <motion.div
      className="relative rounded-2xl border border-[#22D3EE]/10 bg-[#0D1117]/60 backdrop-blur-sm p-8 md:p-10 max-w-lg mx-auto"
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.5 }}
    >
      {/* Subtle cyan gradient at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE]/30 to-transparent" />

      <div className="flex flex-col items-center text-center">
        <GradientAvatar
          initials={supervisor.initials}
          size="md"
          accentColor={supervisor.accentColor}
        />

        <div className="mt-5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Icon className="w-4 h-4 text-[#22D3EE]" />
            <span className="font-mono text-[10px] font-medium tracking-[0.2em] uppercase text-[#22D3EE]">
              {supervisor.role}
            </span>
          </div>
          <h3 className="font-headline text-xl font-bold text-[#E6EDF3] mb-1">
            {supervisor.name}
          </h3>
          <p className="font-body text-sm text-[#484F58]">{supervisor.focus}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main section ────────────────────────────────────────── */

export default function TeamSection() {
  const leader = members.find((m) => m.isLeader)!;
  const teamMembers = members.filter((m) => !m.isLeader);

  return (
    <section id="team" className="relative py-24 md:py-36 overflow-hidden">
      <BackgroundLayers section="socialProof" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 w-full">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[#3B82F6] mb-4 block">
            The Team
          </span>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-4">
            Built by people who care.
          </h2>
          <p className="font-body text-[#8B949E] max-w-xl mx-auto">
            Five engineers and one vision — making video conferencing safe from
            deepfakes.
          </p>
        </motion.div>

        {/* Featured leader card */}
        <div className="mb-8">
          <LeaderCard member={leader} />
        </div>

        {/* Team members grid — 4 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-16">
          {teamMembers.map((member, i) => (
            <MemberCard key={member.name} member={member} index={i} />
          ))}
        </div>

        {/* Supervised by divider */}
        <motion.div
          className="flex items-center gap-4 max-w-sm mx-auto mb-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#22D3EE]/20" />
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#484F58]">
            Supervised by
          </span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#22D3EE]/20" />
        </motion.div>

        {/* Supervisor card */}
        <SupervisorCard />

        {/* University credit */}
        <motion.div
          className="flex justify-center mt-14"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/[0.06] bg-[#0D1117]/60 backdrop-blur-sm">
            <GraduationCap className="w-4 h-4 text-[#3B82F6]" />
            <span className="font-mono text-xs text-[#8B949E]">
              CSIT321 Graduation Project &mdash; University of Wollongong in
              Dubai
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
