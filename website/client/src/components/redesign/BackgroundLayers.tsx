import PerspectiveGrid from './PerspectiveGrid';
import AuroraWaves from './AuroraWaves';
import ParticleConstellation from './ParticleConstellation';

interface LayerConfig {
  grid?: number;
  aurora?: number;
  particles?: number;
  auroraVariant?: 'default' | 'red';
}

const sectionConfigs: Record<string, LayerConfig> = {
  hero:         { grid: 1,    aurora: 1,    particles: 1    },
  trust:        { grid: 0.3,  aurora: 0,    particles: 0.3  },
  threat:       { grid: 0.2,  aurora: 0.8,  particles: 0,   auroraVariant: 'red' },
  demo:         { grid: 0.3,  aurora: 0.5,  particles: 0    },
  features:     { grid: 0.3,  aurora: 1,    particles: 0    },
  video:        { grid: 0,    aurora: 0.4,  particles: 0    },
  howItWorks:   { grid: 0.3,  aurora: 0,    particles: 1    },
  socialProof:  { grid: 0.2,  aurora: 0.4,  particles: 0.3  },
  mobileApp:    { grid: 0.2,  aurora: 0.6,  particles: 0.5  },
  cta:          { grid: 0,    aurora: 0.4,  particles: 0    },
};

export default function BackgroundLayers({ section }: { section: string }) {
  const config = sectionConfigs[section] || { grid: 0, aurora: 0, particles: 0 };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {config.grid ? <PerspectiveGrid opacity={config.grid} /> : null}
      {config.aurora ? <AuroraWaves opacity={config.aurora} variant={config.auroraVariant || 'default'} /> : null}
      {config.particles ? <ParticleConstellation opacity={config.particles} /> : null}
    </div>
  );
}
