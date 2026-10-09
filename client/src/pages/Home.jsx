import { Link } from 'react-router-dom'
import { Button } from '../components/ui.jsx'

export default function Home() {
  return (
    <div className="w-[100vw] relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-swiss-base overflow-hidden">
      
      {/* HERO SECTION */}
      <section className="relative min-h-[85vh] flex flex-col items-center justify-center pt-20 pb-32 px-4 border-b border-swiss-border">
        {/* Network Visualization Background */}
        <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none flex items-center justify-center">
          <div className="relative w-full max-w-5xl h-96">
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-swiss-text rounded-full shadow-[0_0_15px_rgba(255,255,255,1)] animate-pulse" />
            <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-swiss-text rounded-full" />
            <div className="absolute top-3/4 left-2/3 w-2 h-2 bg-swiss-text rounded-full" />
            <div className="absolute top-1/3 left-3/4 w-2 h-2 bg-swiss-text rounded-full" />
            
            <svg className="absolute inset-0 w-full h-full" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4">
              <line x1="25%" y1="25%" x2="50%" y2="50%" className="text-swiss-text/50" />
              <line x1="50%" y1="50%" x2="66%" y2="75%" className="text-swiss-text/50" />
              <line x1="50%" y1="50%" x2="75%" y2="33%" className="text-swiss-text/50" />
            </svg>
            
            <span className="absolute top-1/4 left-1/4 -ml-12 mt-4 text-[9px] font-mono tracking-widest text-swiss-label">ALUMNI</span>
            <span className="absolute top-1/2 left-1/2 ml-4 -mt-2 text-[9px] font-mono tracking-widest text-swiss-label">COMPANY</span>
            <span className="absolute top-3/4 left-2/3 ml-4 -mt-2 text-[9px] font-mono tracking-widest text-swiss-label">STUDENT</span>
            <span className="absolute top-1/3 left-3/4 ml-4 mt-2 text-[9px] font-mono tracking-widest text-swiss-label">MENTOR</span>
          </div>
        </div>

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-swiss-text leading-[1.05]">
            Your alumni network.<br/>Built for what's next.
          </h1>
          <p className="mt-8 text-lg md:text-xl text-swiss-muted max-w-2xl mx-auto leading-relaxed">
            Connect with alumni, find mentors, discover opportunities, and stay connected to the community that continues beyond graduation.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register"><Button size="lg" className="px-10 py-4 text-base font-bold">JOIN THE NETWORK</Button></Link>
            <Link to="/directory"><Button variant="secondary" size="lg" className="px-10 py-4 text-base">EXPLORE THE COMMUNITY</Button></Link>
          </div>
        </div>
      </section>

      {/* COMMUNITY STRIP */}
      <div className="border-b border-swiss-border py-4 overflow-hidden bg-swiss-surface">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest">
          <span className="text-swiss-label mr-8">ONE NETWORK. MANY PATHS.</span>
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-swiss-text">
            <span>ALUMNI</span>
            <span>STUDENTS</span>
            <span>MENTORS</span>
            <span>COMPANIES</span>
            <span>OPPORTUNITIES</span>
          </div>
        </div>
      </div>

      {/* CORE VALUE: CONNECTION */}
      <section className="py-32 px-4 max-w-7xl mx-auto border-b border-swiss-border">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-6">01 &mdash; CONNECTION</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-swiss-text leading-tight mb-8">
              Meet the people who can move your journey forward.
            </h2>
            <p className="text-lg text-swiss-muted mb-10 leading-relaxed max-w-lg">
              The Alumni Directory isn't just a list of names. It's an intelligent grid of professionals, searchable by industry, location, and willingness to help.
            </p>
            <Link to="/directory"><Button>EXPLORE ALUMNI</Button></Link>
          </div>
          <div className="relative border border-swiss-border p-8 bg-swiss-surface shadow-2xl">
            <div className="flex items-center gap-4 border-b border-swiss-border pb-6 mb-6">
              <div className="w-16 h-16 bg-[var(--color-swiss-surface-hover)] rounded-full" />
              <div>
                <h3 className="text-xl font-bold text-swiss-text">Sarah Jenkins</h3>
                <p className="text-swiss-muted text-sm font-mono tracking-widest uppercase">Product Designer</p>
              </div>
            </div>
            <div className="space-y-4 font-mono text-xs text-swiss-label uppercase tracking-widest">
              <div className="flex justify-between border-b border-swiss-border pb-2"><span>Location</span><span className="text-swiss-text">San Francisco, CA</span></div>
              <div className="flex justify-between border-b border-swiss-border pb-2"><span>Industry</span><span className="text-swiss-text">Technology</span></div>
              <div className="flex justify-between pb-2"><span>Status</span><span className="text-green-500">Available to mentor</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* MENTORSHIP */}
      <section className="py-32 px-4 max-w-7xl mx-auto border-b border-swiss-border">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-6">02 &mdash; MENTORSHIP</p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-swiss-text leading-tight mb-10">
            Experience is more useful when it's shared.
          </h2>
          <Link to="/mentorship"><Button>FIND A MENTOR</Button></Link>
        </div>
        
        <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="border border-swiss-border p-6 bg-swiss-surface w-full md:w-64 text-center z-10">
            <div className="w-12 h-12 bg-[var(--color-swiss-surface-hover)] rounded-full mx-auto mb-4" />
            <p className="font-bold text-swiss-text">Alex Chen</p>
            <p className="text-[10px] font-mono text-swiss-label tracking-widest uppercase mt-1">Student</p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center relative w-full border-l md:border-l-0 md:border-t border-dashed border-swiss-border py-8 md:py-0">
            <span className="bg-swiss-base px-4 py-2 border border-swiss-text font-mono text-[10px] tracking-widest text-swiss-text uppercase absolute -top-4 md:top-1/2 md:-translate-y-1/2">MENTORSHIP MATCH</span>
            <div className="mt-8 md:mt-12 flex flex-col md:flex-row gap-4 font-mono text-[9px] tracking-widest uppercase text-swiss-muted">
              <span className="border border-swiss-border px-3 py-1">Career Guidance</span>
              <span className="border border-swiss-border px-3 py-1">Interview Prep</span>
              <span className="border border-swiss-border px-3 py-1">Industry Insight</span>
            </div>
          </div>

          <div className="border border-swiss-border p-6 bg-swiss-surface w-full md:w-64 text-center z-10">
            <div className="w-12 h-12 bg-[var(--color-swiss-surface-hover)] rounded-full mx-auto mb-4" />
            <p className="font-bold text-swiss-text">Dr. Emily Wright</p>
            <p className="text-[10px] font-mono text-swiss-label tracking-widest uppercase mt-1">Engineering Director</p>
          </div>
        </div>
      </section>

      {/* CAREER */}
      <section className="py-32 px-4 max-w-7xl mx-auto border-b border-swiss-border">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 relative border border-swiss-border p-8 bg-swiss-surface">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-swiss-text mb-2">Senior Frontend Developer</h3>
              <p className="text-swiss-muted font-mono text-xs uppercase tracking-widest">FinTech Corp &bull; Remote</p>
            </div>
            <div className="space-y-4 border-t border-swiss-border pt-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-mono text-xs text-swiss-text uppercase tracking-widest">High Match (92%)</span>
              </div>
              <div className="flex gap-2">
                <span className="border border-swiss-border px-2 py-1 font-mono text-[10px] text-swiss-label uppercase">React</span>
                <span className="border border-swiss-border px-2 py-1 font-mono text-[10px] text-swiss-label uppercase">TypeScript</span>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-6">03 &mdash; CAREER</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-swiss-text leading-tight mb-8">
              Turn your network into your next opportunity.
            </h2>
            <div className="flex flex-wrap gap-4 font-mono text-[10px] tracking-widest text-swiss-muted uppercase mb-10">
              <span className="border-l-2 border-swiss-text pl-2">Resume</span>
              <span className="border-l-2 border-swiss-text pl-2">Skill Gap</span>
              <span className="border-l-2 border-swiss-text pl-2">Job Readiness</span>
              <span className="border-l-2 border-swiss-text pl-2">Career Roadmap</span>
            </div>
            <Link to="/jobs"><Button>EXPLORE OPPORTUNITIES</Button></Link>
          </div>
        </div>
      </section>

      {/* AI CAREER INTELLIGENCE */}
      <section className="py-32 px-4 max-w-7xl mx-auto border-b border-swiss-border text-center">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-6">04 &mdash; CAREER INTELLIGENCE</p>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-swiss-text leading-tight max-w-4xl mx-auto mb-20">
          A clearer view of where you are,<br/>and where you could go next.
        </h2>
        
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 font-mono text-xs uppercase tracking-widest text-swiss-muted">
          <span>RESUME</span>
          <span className="hidden md:inline">→</span>
          <span className="md:hidden">&darr;</span>
          <span>SKILLS</span>
          <span className="hidden md:inline">→</span>
          <span className="md:hidden">&darr;</span>
          <span>READINESS</span>
          <span className="hidden md:inline">→</span>
          <span className="md:hidden">&darr;</span>
          <span>OPPORTUNITIES</span>
          <span className="hidden md:inline">→</span>
          <span className="md:hidden">&darr;</span>
          <span>ROADMAP</span>
        </div>
        
        <div className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">Resume Analysis</p></div>
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">Job Readiness</p></div>
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">Skill Gap Analysis</p></div>
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">Career Roadmaps</p></div>
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">AI Career Assistant</p></div>
          <div className="border border-swiss-border p-4 bg-swiss-surface"><p className="font-mono text-[10px] text-swiss-text tracking-widest uppercase">Intelligent Recommendations</p></div>
        </div>
        
        <div className="mt-16">
          <Link to="/job-readiness"><Button>EXPLORE CAREER TOOLS</Button></Link>
        </div>
      </section>

      {/* EVENTS / COMMUNITY */}
      <section className="py-32 px-4 max-w-7xl mx-auto border-b border-swiss-border">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-6">05 &mdash; COMMUNITY</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-swiss-text leading-tight mb-10">
              There is more to alumni life than a directory.
            </h2>
            <div className="flex flex-wrap gap-3 font-mono text-xs uppercase tracking-widest text-swiss-muted mb-12">
              <span className="border border-swiss-border px-3 py-1 bg-swiss-surface">Reunions</span>
              <span className="border border-swiss-border px-3 py-1 bg-swiss-surface">Networking</span>
              <span className="border border-swiss-border px-3 py-1 bg-swiss-surface">Workshops</span>
              <span className="border border-swiss-border px-3 py-1 bg-swiss-surface">Talks</span>
            </div>
            <Link to="/events"><Button>DISCOVER EVENTS</Button></Link>
          </div>
          <div className="border border-swiss-border p-8 bg-swiss-surface flex items-start gap-8">
            <div className="text-center font-bold text-swiss-text border-r border-swiss-border pr-8">
              <span className="block text-6xl leading-none">18</span>
              <span className="block mt-2 text-sm tracking-widest">NOV</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-swiss-text mb-4 leading-tight">ALUMNI NETWORKING NIGHT</h3>
              <p className="text-swiss-muted font-mono text-xs uppercase tracking-widest">San Francisco &bull; Networking</p>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM FLOW */}
      <section className="py-32 px-4 bg-swiss-text text-swiss-base border-b border-swiss-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 font-mono tracking-widest uppercase">
          <div className="space-y-4">
            <span className="block text-2xl font-bold">01</span>
            <span className="block border-t border-swiss-base/30 pt-4 font-bold">DISCOVER</span>
            <p className="text-[9px] opacity-70">Find peers and alumni</p>
          </div>
          <div className="space-y-4">
            <span className="block text-2xl font-bold">02</span>
            <span className="block border-t border-swiss-base/30 pt-4 font-bold">CONNECT</span>
            <p className="text-[9px] opacity-70">Reach out directly</p>
          </div>
          <div className="space-y-4">
            <span className="block text-2xl font-bold">03</span>
            <span className="block border-t border-swiss-base/30 pt-4 font-bold">LEARN</span>
            <p className="text-[9px] opacity-70">Find a mentor</p>
          </div>
          <div className="space-y-4">
            <span className="block text-2xl font-bold">04</span>
            <span className="block border-t border-swiss-base/30 pt-4 font-bold">GROW</span>
            <p className="text-[9px] opacity-70">Unlock career paths</p>
          </div>
          <div className="space-y-4">
            <span className="block text-2xl font-bold">05</span>
            <span className="block border-t border-swiss-base/30 pt-4 font-bold">CONTRIBUTE</span>
            <p className="text-[9px] opacity-70">Give back to the network</p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-40 px-4 max-w-4xl mx-auto text-center">
        <h2 className="text-5xl md:text-7xl font-bold text-swiss-text leading-tight mb-8">
          The people you need<br/>are already part of your story.
        </h2>
        <p className="text-xl text-swiss-muted max-w-2xl mx-auto mb-12">
          Join the alumni network and discover the connections, opportunities and experiences waiting beyond graduation.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link to="/register"><Button size="lg" className="px-10">JOIN THE NETWORK</Button></Link>
          <Link to="/login"><Button variant="secondary" size="lg" className="px-10">SIGN IN</Button></Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-swiss-border bg-swiss-surface py-20 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 font-mono text-xs uppercase tracking-widest text-swiss-muted">
          <div>
            <h4 className="text-swiss-text font-bold mb-6">PLATFORM</h4>
            <ul className="space-y-4">
              <li><Link to="/directory" className="hover:text-swiss-text transition-colors">Network</Link></li>
              <li><Link to="/mentorship" className="hover:text-swiss-text transition-colors">Mentorship</Link></li>
              <li><Link to="/jobs" className="hover:text-swiss-text transition-colors">Careers</Link></li>
              <li><Link to="/events" className="hover:text-swiss-text transition-colors">Events</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-swiss-text font-bold mb-6">COMMUNITY</h4>
            <ul className="space-y-4">
              <li><span className="hover:text-swiss-text transition-colors cursor-not-allowed">Alumni</span></li>
              <li><span className="hover:text-swiss-text transition-colors cursor-not-allowed">Students</span></li>
              <li><span className="hover:text-swiss-text transition-colors cursor-not-allowed">Companies</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-swiss-text font-bold mb-6">ACCOUNT</h4>
            <ul className="space-y-4">
              <li><Link to="/login" className="hover:text-swiss-text transition-colors">Sign In</Link></li>
              <li><Link to="/register" className="hover:text-swiss-text transition-colors">Register</Link></li>
            </ul>
          </div>
          <div className="col-span-2 md:col-span-1 border-t md:border-t-0 border-swiss-border pt-8 md:pt-0">
            <h4 className="text-swiss-text font-bold mb-4">ALUMNI NETWORK PORTAL</h4>
            <p className="mb-8 opacity-70">CONNECT &bull; GROW &bull; GIVE BACK</p>
            <p className="opacity-50 text-[9px]">&copy; {new Date().getFullYear()} Alumni Network. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
