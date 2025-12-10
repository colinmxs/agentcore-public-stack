import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex justify-center items-center',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  template: `
    <!-- Background stars -->
    @for (star of stars; track $index) {
      <div 
        class="absolute size-0.5 bg-white rounded-full animate-twinkle"
        [style.top]="star.top"
        [style.left]="star.left"
        [style.animation-delay]="star.delay">
      </div>
    }

    <div class="relative" [style.width.px]="size()" [style.height.px]="size()">
      <!-- Gravitational lensing rings -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/30 animate-lensing-pulse"
        [style.width.px]="size() * 0.6"
        [style.height.px]="size() * 0.6">
      </div>
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-300/20 animate-lensing-pulse-delayed"
        [style.width.px]="size() * 0.73"
        [style.height.px]="size() * 0.73">
      </div>
      
      <!-- Outer accretion disk -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-disk-rotate blur-sm"
        [style.width.px]="size() * 0.83"
        [style.height.px]="size() * 0.83"
        style="background: conic-gradient(
          from 0deg,
          transparent 0deg,
          rgba(255, 120, 30, 0.4) 30deg,
          rgba(255, 180, 80, 0.6) 60deg,
          rgba(255, 200, 100, 0.5) 90deg,
          rgba(255, 150, 50, 0.4) 120deg,
          transparent 150deg,
          transparent 210deg,
          rgba(255, 120, 30, 0.3) 240deg,
          rgba(255, 180, 80, 0.5) 270deg,
          rgba(255, 150, 50, 0.4) 300deg,
          transparent 360deg
        ); transform: translate(-50%, -50%) rotateX(75deg);">
      </div>
      
      <!-- Inner accretion disk -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-disk-rotate-inner blur-xs"
        [style.width.px]="size() * 0.5"
        [style.height.px]="size() * 0.5"
        style="background: conic-gradient(
          from 0deg,
          rgba(255, 200, 150, 0.6) 0deg,
          rgba(255, 150, 80, 0.8) 90deg,
          rgba(255, 100, 30, 0.7) 180deg,
          rgba(255, 150, 80, 0.8) 270deg,
          rgba(255, 200, 150, 0.6) 360deg
        ); transform: translate(-50%, -50%) rotateX(75deg);">
      </div>
      
      <!-- Event horizon glow -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-horizon-pulse"
        [style.width.px]="size() * 0.33"
        [style.height.px]="size() * 0.33"
        style="background: radial-gradient(circle, 
          transparent 40%,
          rgba(255, 100, 0, 0.3) 50%,
          rgba(255, 150, 50, 0.2) 60%,
          transparent 70%
        );">
      </div>
      
      <!-- Singularity - pure black center -->
      <div 
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black rounded-full z-10"
        [style.width.px]="size() * 0.2"
        [style.height.px]="size() * 0.2"
        style="box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(0, 0, 0, 1);">
      </div>
      
      <!-- Orbiting particles -->
      @for (particle of particles; track $index) {
        <div 
          class="absolute top-1/2 left-1/2 size-1 bg-orange-200 rounded-full shadow-[0_0_6px_rgba(255,180,100,0.8)]"
          [class]="'animate-orbit-' + ($index + 1)">
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes twinkle {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    @keyframes horizon-pulse {
      0%, 100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.8;
      }
      50% {
        transform: translate(-50%, -50%) scale(1.1);
        opacity: 1;
      }
    }

    @keyframes disk-rotate {
      from {
        transform: translate(-50%, -50%) rotateX(75deg) rotateZ(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotateX(75deg) rotateZ(360deg);
      }
    }

    @keyframes disk-rotate-inner {
      from {
        transform: translate(-50%, -50%) rotateX(75deg) rotateZ(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotateX(75deg) rotateZ(360deg);
      }
    }

    @keyframes lensing-pulse {
      0%, 100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
      }
      50% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    @keyframes lensing-pulse-delayed {
      0%, 100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
      }
      50% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    @keyframes orbit-1 {
      from {
        transform: translate(-50%, -50%) rotate(0deg) translateX(80px) rotate(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotate(360deg) translateX(80px) rotate(-360deg);
      }
    }

    @keyframes orbit-2 {
      from {
        transform: translate(-50%, -50%) rotate(45deg) rotate(0deg) translateX(100px) rotate(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotate(45deg) rotate(360deg) translateX(100px) rotate(-360deg);
      }
    }

    @keyframes orbit-3 {
      from {
        transform: translate(-50%, -50%) rotate(90deg) rotate(0deg) translateX(120px) rotate(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotate(90deg) rotate(360deg) translateX(120px) rotate(-360deg);
      }
    }

    @keyframes orbit-4 {
      from {
        transform: translate(-50%, -50%) rotate(180deg) rotate(0deg) translateX(95px) rotate(0deg);
      }
      to {
        transform: translate(-50%, -50%) rotate(180deg) rotate(360deg) translateX(95px) rotate(-360deg);
      }
    }

    .animate-twinkle {
      animation: twinkle 3s ease-in-out infinite;
    }

    .animate-horizon-pulse {
      animation: horizon-pulse 2s ease-in-out infinite;
    }

    .animate-disk-rotate {
      animation: disk-rotate 3s linear infinite;
    }

    .animate-disk-rotate-inner {
      animation: disk-rotate-inner 1.5s linear infinite;
    }

    .animate-lensing-pulse {
      animation: lensing-pulse 3s ease-in-out infinite;
      animation-delay: 0s;
    }

    .animate-lensing-pulse-delayed {
      animation: lensing-pulse-delayed 3s ease-in-out infinite;
      animation-delay: 0.5s;
    }

    .animate-orbit-1 {
      animation: orbit-1 2s linear infinite;
    }

    .animate-orbit-2 {
      animation: orbit-2 2.5s linear infinite;
    }

    .animate-orbit-3 {
      animation: orbit-3 3s linear infinite;
    }

    .animate-orbit-4 {
      animation: orbit-4 2.2s linear infinite;
    }
  `,
})
export class LoadingComponent {
  /** Size of the black hole in pixels */
  size = input<number>(300);
  
  /** Width of the container (defaults to '100%') */
  width = input<string>('100%');
  
  /** Height of the container (defaults to '100%') */
  height = input<string>('100%');

  protected readonly stars = [
    { top: '10%', left: '20%', delay: '0s' },
    { top: '30%', left: '80%', delay: '0.5s' },
    { top: '70%', left: '15%', delay: '1s' },
    { top: '85%', left: '70%', delay: '1.5s' },
    { top: '20%', left: '90%', delay: '2s' },
  ];

  protected readonly particles = [1, 2, 3, 4];
}