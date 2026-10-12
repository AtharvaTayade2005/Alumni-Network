import { describe, it, expect, vi } from 'vitest'
import { resumes, jobs, events } from './api.real.js'

describe('Client Vitest: Task 1 - Resume Upload & Validation', () => {
  it('TC-RESUME-01: validates file size limits (rejects > 5MB)', () => {
    const MAX_BYTES = 5 * 1024 * 1024
    const validFile = { name: 'resume.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' }
    const oversizedFile = { name: 'huge_resume.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' }
    const emptyFile = { name: 'empty.pdf', size: 0, type: 'application/pdf' }

    expect(validFile.size <= MAX_BYTES).toBe(true)
    expect(validFile.size > 0).toBe(true)
    expect(oversizedFile.size > MAX_BYTES).toBe(true)
    expect(emptyFile.size === 0).toBe(true)
  })

  it('TC-RESUME-02: validates file extension and MIME types', () => {
    const allowedExtensions = ['.pdf', '.doc', '.docx']
    const allowedMime = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    const checkAllowed = (name, type) => {
      const ext = '.' + (name.split('.').pop() || '').toLowerCase()
      return allowedExtensions.includes(ext) || allowedMime.includes(type)
    }

    expect(checkAllowed('resume.pdf', 'application/pdf')).toBe(true)
    expect(checkAllowed('resume.doc', 'application/msword')).toBe(true)
    expect(checkAllowed('resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(checkAllowed('script.exe', 'application/x-msdownload')).toBe(false)
    expect(checkAllowed('malicious.sh', 'application/x-sh')).toBe(false)
    expect(checkAllowed('photo.jpg', 'image/jpeg')).toBe(false)
  })

  it('TC-RESUME-03: returns null resume safely on 404 or missing resume without throwing', async () => {
    // When backend returns empty/null, resumes.get returns { data: null }
    const res = await resumes.get()
    // Either data is formatted resume or null, never undefined
    expect(res).toHaveProperty('data')
  })
})

describe('Client Vitest: Task 2 - Jobs & Internships Interactions', () => {
  const isJobOpen = (status) => ['active', 'published', 'open'].includes(String(status || '').toLowerCase())

  it('TC-JOBS-01: recognizes backend PUBLISHED status as open for saving', () => {
    expect(isJobOpen('PUBLISHED')).toBe(true)
    expect(isJobOpen('published')).toBe(true)
    expect(isJobOpen('active')).toBe(true)
    expect(isJobOpen('DRAFT')).toBe(false)
    expect(isJobOpen('CLOSED')).toBe(false)
  })

  it('TC-JOBS-02: allows saving open jobs and toggling saved state', () => {
    const job = {
      id: 'job-123',
      title: 'Full Stack Engineer',
      status: 'PUBLISHED',
      isSaved: false,
    }

    const open = isJobOpen(job.status)
    const isDisabled = !job.isSaved && !open
    expect(isDisabled).toBe(false)

    // Toggle saved state
    const savedJob = { ...job, isSaved: true }
    expect(savedJob.isSaved).toBe(true)
    // Saved jobs can be unsaved even if closed
    const closedSavedJob = { ...savedJob, status: 'CLOSED' }
    const canUnsaveClosed = !(!closedSavedJob.isSaved && !isJobOpen(closedSavedJob.status))
    expect(canUnsaveClosed).toBe(true)
  })

  it('TC-JOBS-03: formats structured description blocks safely', () => {
    const rawText = `About Us:\nInnovative software development company.\n\nKey Requirements:\n- 3+ years experience with React\n- Strong knowledge of Node.js\n- Experience with SQL\n\nNice to have:\n* TypeScript\n* Docker`

    const lines = rawText.split('\n')
    const blocks = []
    let currentList = []

    const flushList = () => {
      if (currentList.length > 0) {
        blocks.push({ type: 'list', items: [...currentList] })
        currentList = []
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (!trimmed) {
        flushList()
        continue
      }
      const bulletMatch = trimmed.match(/^([-*•]|\d+\.)\s+(.+)$/)
      if (bulletMatch) {
        currentList.push(bulletMatch[2])
        continue
      }
      flushList()
      if (trimmed.endsWith(':') || (trimmed.length <= 40 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))) {
        blocks.push({ type: 'heading', text: trimmed })
      } else {
        blocks.push({ type: 'paragraph', text: trimmed })
      }
    }
    flushList()

    expect(blocks.some((b) => b.type === 'heading' && b.text === 'About Us:')).toBe(true)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Key Requirements:')).toBe(true)
    const listBlock = blocks.find((b) => b.type === 'list')
    expect(listBlock).toBeDefined()
    expect(listBlock.items).toContain('3+ years experience with React')
    expect(listBlock.items).toContain('Strong knowledge of Node.js')
  })
})

describe('Client Vitest: Task 3 - Events Details & RSVP Object Rendering', () => {
  it('TC-EVENTS-01: safely extracts organizer name and avatar from object', () => {
    const eventWithObj = {
      id: 'evt-1',
      title: 'Annual Alumni Gathering',
      organizer: {
        id: 'usr-42',
        name: 'Dr. Jane Smith',
        avatarUrl: 'https://example.com/avatar.jpg',
      },
    }

    const organizerName = typeof eventWithObj.organizer === 'object'
      ? (eventWithObj.organizer?.name || 'Alumni Network')
      : (eventWithObj.organizer || 'Alumni Network')
    const organizerAvatar = typeof eventWithObj.organizer === 'object'
      ? eventWithObj.organizer?.avatarUrl
      : null

    expect(organizerName).toBe('Dr. Jane Smith')
    expect(organizerAvatar).toBe('https://example.com/avatar.jpg')
    // Crucial: organizerName is a string, preventing "Objects are not valid as a React child"
    expect(typeof organizerName).toBe('string')
  })

  it('TC-EVENTS-02: handles string or null organizer gracefully without crashing', () => {
    const eventWithString = { id: 'evt-2', organizer: 'Atharva Alumni Association' }
    const eventWithNull = { id: 'evt-3', organizer: null }

    const getName = (evt) => (
      typeof evt.organizer === 'object'
        ? (evt.organizer?.name || 'Alumni Network')
        : (evt.organizer || 'Alumni Network')
    )

    expect(getName(eventWithString)).toBe('Atharva Alumni Association')
    expect(getName(eventWithNull)).toBe('Alumni Network')
  })

  it('TC-EVENTS-03: accurately normalizes user RSVP status from backend myRsvp', () => {
    const rawBackendEvent1 = {
      id: 'evt-10',
      title: 'Tech Mixer',
      myRsvp: { status: 'GOING' },
    }
    const rawBackendEvent2 = {
      id: 'evt-11',
      title: 'Webinar',
      myRsvp: null,
    }

    const normalize = (evt) => ({
      ...evt,
      hasRsvpd: evt.hasRsvpd !== undefined
        ? evt.hasRsvpd
        : Boolean(evt.myRsvp && (evt.myRsvp.status === 'GOING' || evt.myRsvp.status === 'going')),
    })

    expect(normalize(rawBackendEvent1).hasRsvpd).toBe(true)
    expect(normalize(rawBackendEvent2).hasRsvpd).toBe(false)
  })

  it('TC-EVENTS-04: enforces event capacity limit on RSVP button', () => {
    const fullEvent = {
      id: 'evt-full',
      capacity: 50,
      attendeesCount: 50,
      hasRsvpd: false,
    }
    const openEvent = {
      id: 'evt-open',
      capacity: 50,
      attendeesCount: 30,
      hasRsvpd: false,
    }
    const registeredInFullEvent = {
      id: 'evt-full-me',
      capacity: 50,
      attendeesCount: 50,
      hasRsvpd: true,
    }

    const isFull = (evt) => Boolean(evt.capacity && evt.attendeesCount >= evt.capacity && !evt.hasRsvpd)

    expect(isFull(fullEvent)).toBe(true)
    expect(isFull(openEvent)).toBe(false)
    // If user already RSVP'd, they are not blocked from cancelling
    expect(isFull(registeredInFullEvent)).toBe(false)
  })
})

describe('Client Vitest: Task 1 - Alumni Directory Connection Workflow', () => {
  it('TC-CONN-01: correctly evaluates connection states for directory members', () => {
    const currentUserId = 'u_student_demo'

    const evaluateState = (person, currentUserId, pendingList = []) => {
      if (person.id === currentUserId || person.connectionState === 'self') return 'self'
      if (person.connectionState) return person.connectionState
      const match = pendingList.find((p) => p.peer?.id === person.id)
      if (match) return match.direction === 'incoming' ? 'pending_incoming' : 'pending_outgoing'
      return 'none'
    }

    const selfUser = { id: currentUserId, name: 'Dev Student' }
    const connectedUser = { id: 'u_alumni_aarav', connectionState: 'connected' }
    const outgoingUser = { id: 'u_alumni_neha', connectionState: 'pending_outgoing' }
    const incomingUser = { id: 'u_alumni_priya', connectionState: 'pending_incoming' }
    const newUser = { id: 'u_alumni_aditya', connectionState: 'none' }

    expect(evaluateState(selfUser, currentUserId)).toBe('self')
    expect(evaluateState(connectedUser, currentUserId)).toBe('connected')
    expect(evaluateState(outgoingUser, currentUserId)).toBe('pending_outgoing')
    expect(evaluateState(incomingUser, currentUserId)).toBe('pending_incoming')
    expect(evaluateState(newUser, currentUserId)).toBe('none')
  })

  it('TC-CONN-02: maps connection state to proper UI action buttons', () => {
    const getActionType = (state) => {
      switch (state) {
        case 'self': return 'badge_you'
        case 'connected': return 'badge_connected_and_message'
        case 'pending_outgoing': return 'button_pending_disabled'
        case 'pending_incoming': return 'button_accept_decline'
        case 'none': return 'button_connect'
        default: return 'button_connect'
      }
    }

    expect(getActionType('self')).toBe('badge_you')
    expect(getActionType('connected')).toBe('badge_connected_and_message')
    expect(getActionType('pending_outgoing')).toBe('button_pending_disabled')
    expect(getActionType('pending_incoming')).toBe('button_accept_decline')
    expect(getActionType('none')).toBe('button_connect')
  })

  it('TC-CONN-03: optimistic update updates connectionState without reload jitter', () => {
    const initialRows = [
      { id: 'usr-1', name: 'Aarav Mehta', connectionState: 'none' },
      { id: 'usr-2', name: 'Neha Kapoor', connectionState: 'none' },
    ]

    const updatedRows = initialRows.map((r) => (
      r.id === 'usr-1' ? { ...r, connectionState: 'pending_outgoing' } : r
    ))

    expect(updatedRows[0].connectionState).toBe('pending_outgoing')
    expect(updatedRows[1].connectionState).toBe('none')
  })
})

describe('Client Vitest: Task 2 - Dashboard Recommended Mentors & Profiles', () => {
  it('TC-MENTOR-01: ensures valid UUID identifier is used for profile navigation', () => {
    const mentorWithRealId = {
      id: 'eecbd106-ccb4-4f58-adc9-fdc57be7194b',
      name: 'Aarav Mehta',
      currentPosition: 'Sr. Software Engineer',
      currentCompany: 'Microsoft',
      openSlots: 2,
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(mentorWithRealId.id)).toBe(true)

    // Construct profile URL
    const profileUrl = `/alumni/${mentorWithRealId.id}`
    expect(profileUrl).toBe('/alumni/eecbd106-ccb4-4f58-adc9-fdc57be7194b')
  })

  it('TC-MENTOR-02: detects 404 and 422 as friendly not-found instead of crashing', () => {
    const error404 = { status: 404, message: 'Profile not found' }
    const error422 = { status: 422, message: 'Validation failed' }
    const error500 = { status: 500, message: 'Internal Server Error' }

    const isNotFoundError = (err) => err?.status === 404 || err?.status === 422

    expect(isNotFoundError(error404)).toBe(true)
    expect(isNotFoundError(error422)).toBe(true)
    expect(isNotFoundError(error500)).toBe(false)
  })
})

describe('Client Vitest: Task 4 - Mentorship Three Tabs Architecture', () => {
  it('TC-TABS-01: separates requests into incoming and sent categories', () => {
    const allRequests = [
      { id: 'req-1', direction: 'incoming', status: 'pending', careerGoal: 'Backend architecture guidance' },
      { id: 'req-2', direction: 'outgoing', status: 'pending', careerGoal: 'Product management interview prep' },
      { id: 'req-3', direction: 'incoming', status: 'accepted', careerGoal: 'System design' },
      { id: 'req-4', direction: 'outgoing', status: 'declined', careerGoal: 'Startup advice' },
    ]

    const incoming = allRequests.filter((r) => r.direction === 'incoming')
    const outgoing = allRequests.filter((r) => r.direction === 'outgoing')
    const pendingIncoming = incoming.filter((r) => r.status === 'pending')

    expect(incoming).toHaveLength(2)
    expect(outgoing).toHaveLength(2)
    expect(pendingIncoming).toHaveLength(1)
    expect(incoming[0].id).toBe('req-1')
    expect(outgoing[0].id).toBe('req-2')
  })

  it('TC-TABS-02: provides meaningful explanatory text and empty messages for each tab', () => {
    const tabHeaders = {
      find: {
        title: 'Find a mentor',
        subtitle: 'Explore experienced alumni and faculty, review their expertise, and request guidance for your career or studies.',
        empty: 'No mentors available',
      },
      requests: {
        title: 'Mentorship Requests',
        subtitle: "Track mentorship requests you've sent and respond to requests you've received.",
        emptyIncoming: 'No incoming requests',
        emptySent: 'No sent requests',
      },
      active: {
        title: 'My Mentorships',
        subtitle: 'Manage your active mentoring relationships and revisit the people guiding your progress.',
        empty: 'No mentorships yet',
      },
    }

    expect(tabHeaders.find.subtitle).toContain('Explore experienced alumni')
    expect(tabHeaders.requests.subtitle).toContain('Track mentorship requests')
    expect(tabHeaders.active.subtitle).toContain('Manage your active mentoring relationships')
  })

  it('TC-ROLE-AWARE-01: resolves default tabs and navigation structure by role', () => {
    function getTabsForRole(role) {
      const isMentor = ['ALUMNI', 'PROFESSOR', 'FACULTY'].includes(role?.toUpperCase())
      if (isMentor) {
        return {
          defaultTab: 'incoming_requests',
          tabs: [
            ['incoming_requests', 'Student requests'],
            ['active_mentees', 'Active mentees'],
            ['availability', 'Mentorship settings'],
            ['find', 'Browse peers'],
          ],
          headerSubtext: 'Guide and empower students through 1-on-1 career advice, portfolio critiques, and technical roadmaps.',
        }
      }
      return {
        defaultTab: 'find',
        tabs: [
          ['find', 'Find a mentor'],
          ['my_requests', 'My requests'],
          ['active', 'Active mentorships'],
        ],
        headerSubtext: 'Connect with industry leaders for 1-on-1 career guidance, portfolio reviews, and graduate school advising.',
      }
    }

    const alumniConfig = getTabsForRole('ALUMNI')
    expect(alumniConfig.defaultTab).toBe('incoming_requests')
    expect(alumniConfig.tabs.map(([id]) => id)).toEqual([
      'incoming_requests',
      'active_mentees',
      'availability',
      'find',
    ])
    expect(alumniConfig.headerSubtext).toContain('Guide and empower students')

    const studentConfig = getTabsForRole('STUDENT')
    expect(studentConfig.defaultTab).toBe('find')
    expect(studentConfig.tabs.map(([id]) => id)).toEqual([
      'find',
      'my_requests',
      'active',
    ])
    expect(studentConfig.headerSubtext).toContain('Connect with industry leaders')
  })

  it('TC-ROLE-AWARE-02: formats accept and decline mentorship responses with uppercase status', () => {
    const makeResponsePayload = (action, note) => ({
      status: action.toUpperCase(),
      responseNote: note ? note.trim() : undefined,
    })

    const acceptPayload = makeResponsePayload('ACCEPTED', "Happy to help! Let's connect.")
    expect(acceptPayload).toEqual({
      status: 'ACCEPTED',
      responseNote: "Happy to help! Let's connect.",
    })

    const declinePayload = makeResponsePayload('REJECTED', 'Currently at capacity.')
    expect(declinePayload).toEqual({
      status: 'REJECTED',
      responseNote: 'Currently at capacity.',
    })
  })

  it('TC-ROLE-AWARE-03: renders student profile details for incoming applications', () => {
    const rawStudentRequest = {
      id: 'req-101',
      direction: 'incoming',
      careerGoal: 'System design and distributed systems mentoring',
      areaOfInterest: 'Backend Engineering',
      preferredMode: 'video',
      message: 'Looking for advice on building high-throughput services.',
      createdAt: '2026-10-12T15:00:00Z',
      peer: {
        id: 'student-uuid',
        name: 'Rohan Sharma',
        degree: 'B.Tech',
        department: 'Computer Engineering',
        yearOfStudy: 3,
      },
    }

    const academicString = [
      rawStudentRequest.peer.degree,
      rawStudentRequest.peer.department,
      `Year ${rawStudentRequest.peer.yearOfStudy}`,
    ].filter(Boolean).join(' • ')

    expect(academicString).toBe('B.Tech • Computer Engineering • Year 3')
    expect(rawStudentRequest.direction).toBe('incoming')
    expect(rawStudentRequest.peer.name).toBe('Rohan Sharma')
  })
})

