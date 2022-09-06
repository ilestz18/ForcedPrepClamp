import { TypingText } from '../objects/typingtext'
import { Enum } from '../utils/enum'
import BasicExample from '../objects/examples'
import SideExample from '../objects/sideExample'
import merge_data from '../utils/merge'
import { clamp } from '../utils/clamp'
import signedAngleDeg from '../utils/angulardist'
import { mad, median } from '../utils/medians'
import generateTrials from '../utils/trialgen'
import make_thick_arc from '../utils/arc'
// import { Staircase } from '../utils/staircase'

const WHITE = 0xffffff
const GREEN = 0x00ff00 // actually move to the target
const MAGENTA = 0xff00ff
const RED = 0xff0000
const GRAY = 0x666666
const DARKGRAY = 0x444444
const LIGHTBLUE = 0x86c5da
let TARGET_SIZE_RADIUS = 15 // no longer a constant
const CURSOR_SIZE_RADIUS = 5
const CENTER_SIZE_RADIUS = 10
const MOVE_THRESHOLD = 4
const TARGET_DISTANCE = 300 // *hopefully* they have 300px available?
const TARGET_REF_ANGLE = 270 // degrees, and should be pointed straight up
const CURSOR_RESTORE_POINT = 30 //
const MOVE_SCALE = 0.5 // factor to combat pointer acceleration
const PI = Math.PI

// fill txts later-- we need to plug in instructions based on their runtime mouse choice
let instruct_txts = {}

const states = Enum([
  'INSTRUCT', // show text instructions (based on stage of task)
  'PRETRIAL', // wait until in center
  'MOVING', // shoot through / mask + animation (if probe)
  'SIDE', // which side was the star on?
  'QUESTIONS', // did you see the cursor?
  'POSTTRIAL', // auto teleport back to restore point
  'END' //
])

const Err = {
  reached_away: 1,
  late_start: 2,
  slow_reach: 4,
  wiggly_reach: 8,
  returned_to_center: 16,
  early_start: 32
}

function randint(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randchoice(arr) {
  return arr[Math.floor(arr.length * Math.random())]
}

function countTrials(array) {
  return array.filter((v) => !v['trial_type'].startsWith('instruct_')).length
}

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' })
    this._state = states.INSTRUCT
    this.entering = true
    // these line up with trial_type
    this.all_data = {
      practice_basic: [], // practice reaching with vis feedback
      practice_clamp: []
    }
  }

  create() {
    let config = this.game.config
    let user_config = this.game.user_config
    // let hand = user_config.hand // 'right' or 'left'
    // camera (origin is center)
    this.cameras.main.setBounds(-config.width / 2, -config.height / 2, config.width, config.height)
    let height = config.height
    let hd2 = height / 2
    this.trial_counter = 0
    this.entering = true
    this.state = states.INSTRUCT
    // used for imagery component
    this.rts = []
    this.movets = []
    this.is_debug = user_config.debug

    // set number of repeats
    if (this.is_debug) {
      this.trials = generateTrials(4, user_config.clamp_size, true)
      console.log(this.trials)
      this.typing_speed = 1
    } else {
        this.trials = generateTrials(25, user_config.clamp_size, false)
        console.log(this.trials)
      this.typing_speed = 1
    }
    // min of 1 frame, max of 10 frames (probably 166ms on 60hz machines?), steps of 1 frame
    // 1 up, 2 down (i.e. 2 correct to move a step down, 1 incorrect to move a step up)
    // this ends up getting overwritten once we've computed the per-user movement time
    // this.staircase = new Staircase(1, MAX_STAIRCASE, 1, 2)
    // user cursor
    this.user_cursor = this.add.circle(CURSOR_RESTORE_POINT, CURSOR_RESTORE_POINT, CURSOR_SIZE_RADIUS, LIGHTBLUE) // controlled by user (gray to reduce contrast)
    this.fake_cursor = this.add.circle(0, 0, CURSOR_SIZE_RADIUS, LIGHTBLUE).setVisible(false) // animated by program
    this.dbg_cursor = this.add.circle(0, 0, CURSOR_SIZE_RADIUS, RED, 1).setVisible(false && this.is_debug) // "true" cursor pos without clamp/rot, only in debug mode

    // center
    this.center = this.add.circle(0, 0, 15, WHITE)
    this.origin = new Phaser.Geom.Circle(0, 0, CENTER_SIZE_RADIUS)

    let radians = Phaser.Math.DegToRad(TARGET_REF_ANGLE)
    let x = TARGET_DISTANCE * Math.cos(radians)
    let y = TARGET_DISTANCE * Math.sin(radians)
    this.target = this.add.circle(x, y, TARGET_SIZE_RADIUS, GRAY) //will be changed!
    this.target.visible = false

    // might have attn checks for understanding of colors indicating prep time, add in questions?
  
    // big fullscreen quad in front of game, but behind text instructions
    this.darkener = this.add.rectangle(0, 0, height, height, 0x000000).setAlpha(1)


    // other warnings
    this.other_warns = this.add.
      rexBBCodeText(0, 0, '', {
        fontFamily: 'Verdana',
        fontStyle: 'bold',
        fontSize: 50,
        color: '#ffffff',
        align: 'center',
        stroke: '#444444',
        backgroundColor: '#000000',
        strokeThickness: 4
      }).
      setOrigin(0.5, 0.5).
      setVisible(false)

    this.instructions = TypingText(this, /* half width */-400, -hd2 + 50, '', {
      fontFamily: 'Verdana',
      fontSize: 20,
      wrap: {
        mode: 'word',
        width: 800
      }
    }).setVisible(false)

    this.start_txt = this.add.
      text(0, hd2 - 100, 'Click the mouse button to continue.', {
        fontFamily: 'Verdana',
        fontSize: 50,
        align: 'center'
      }).
      setOrigin(0.5, 0.5).
      setVisible(false)

    this.debug_txt = this.add.text(-hd2, -hd2, '')
    this.progress = this.add.text(hd2, -hd2, '').setOrigin(1, 0)
    this.tmp_counter = 1
    this.total_len = this.trials.length-2 //ad hoc; -2 because two instruction tabs
    // examples
    this.examples = { //come back to this; need to set up prep times in exmples
      // go + feedback
      basic: new BasicExample(this, 0, 200, true, false).setVisible(false),
      clamp: new BasicExample(this, 0, 200, true, true).setVisible(false)
    }


    // start the mouse at offset
    this.raw_x = CURSOR_RESTORE_POINT
    this.raw_y = CURSOR_RESTORE_POINT
    this.next_trial()

    // set up mouse callback (does all the heavy lifting)
    this.input.on('pointerdown', () => {
      if (this.state !== states.END) {
        !DEBUG && this.scale.startFullscreen()
        this.time.delayedCall(300, () => {
          this.input.mouse.requestPointerLock()
        })
      }
    })
    this.input.on('pointerlockchange', () => {
      console.log('oh no, this does not work')
    })

    this.ptr_cb = (ptr) => {
      if (this.input.mouse.locked) {
        let is_coalesced = 'getCoalescedEvents' in ptr
        // feature detect firefox (& ignore, see https://bugzilla.mozilla.org/show_bug.cgi?id=1753724)
        // TODO: detect first input & use as reference position for FF
        let not_ff = 'altitudeAngle' in ptr
        // AFAIK, Safari and IE don't support coalesced events
        // See https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent
        let evts = is_coalesced && not_ff ? ptr.getCoalescedEvents() : [ptr]
        // console.log(evts.length)
        // the timestamps of ptr and the last event should match, and the
        // sum of all movements in evts should match ptr
        // console.log(ptr)
        // console.log(evts[evts.length - 1])
        for (let evt of evts) {
          // scale movement by const factor
          let dx = evt.movementX * MOVE_SCALE
          let dy = evt.movementY * MOVE_SCALE
          // console.log(`t: ${evt.timeStamp}, dxdy: (${dx}, ${dy})`)
          // update "raw" mouse position (remember to set these back to (0, 0)
          // when starting a new trial)
          this.raw_x += dx
          this.raw_y += dy
          this.raw_x = clamp(this.raw_x, -hd2, hd2)
          this.raw_y = clamp(this.raw_y, -hd2, hd2)

          // useful for deciding when to turn on/off visual feedback
          let extent = Math.sqrt(Math.pow(this.raw_x, 2) + Math.pow(this.raw_y, 2))
          // convert cursor angle to degrees
          let cursor_angle = Phaser.Math.RadToDeg(Phaser.Math.Angle.Normalize(Math.atan2(this.raw_y, this.raw_x)))
          let curs_x = this.raw_x
          let curs_y = this.raw_y
          this.dbg_cursor.setPosition(curs_x, curs_y)

          this.cursor_angle = cursor_angle
          this.user_cursor.x = curs_x
          this.user_cursor.y = curs_y
            this.extent = extent

            // set up the clamp cursor
            let rad = Phaser.Math.DegToRad(this.current_trial.clamp_angle + TARGET_REF_ANGLE)
            this.fake_cursor.x = extent * Math.cos(rad)
            this.fake_cursor.y = extent * Math.sin(rad)

          if (this.state === states.MOVING) {
            this.movement_data.push({
              evt_time: evt.timeStamp,
              raw_x: this.raw_x,
              raw_y: this.raw_y,
              cursor_x: curs_x,
              cursor_y: curs_y,
              cursor_extent: extent,
              cursor_angle: cursor_angle
            })
          }
        }
      }
    }

    document.addEventListener('pointermove', this.ptr_cb, {passive: true, capture: true})
    // initial instructions (move straight through target)
    instruct_txts['instruct_basic'] =
        `You will control a circular cursor with your mouse, and try to bring it to the target. Hold that cursor in the circle at the center of the screen to start a trial.\n
        At the top of the screen, you will see either a [color=#ff00ff]magenta[/color] or [color=#00ff00]green[/color] target. \n
        When you see the [color=#ff00ff]magenta[/color] target, try to move immediately to the target. If you run out of time the target will turn [color=#777777]gray[/color] and you will fail the trial.\n
        When you see the [color=#00ff00]green[/color] target, take a moment to plan your movement, but not too long! If you're too early or too late, the target will turn [color=#777777]gray[/color] and you will fail the trial.\n
        Always quickly shoot your mouse straight through the target! If you move too slowly, the target will turn [color=#777777]gray[/color] and you will fail the trial.\n
        Even if the target turns [color=#777777]gray[/color], please complete your reach!\n

        See the example below. We show the system cursor to illustrate the mouse position, but it will never be visible when you are doing the task.`

    instruct_txts['instruct_clamp'] =
          `In this section, the cursor will be broken. It will move in a straight line toward the target, but it will always land slightly off of the center.\n
            You will see the cursor follow this path no matter where you actually move your mouse. You can ignore the cursor. \n
            Instead, try to move your mouse straight to the very center of the target, even though the cursor is broken. The cursor will always be offset but you can ignore that and keep reaching straight towards the target.\n

            Remember to make immediate movements to the [color=#ff00ff]magenta[/color] target and deliberate, planned movements to the [color=#00ff00]green[/color] target.`

    instruct_txts['break'] = 'Take a break! Remember to make immediate movements to the [color=#ff00ff]magenta[/color] target and deliberate, planned movements to the [color=#00ff00]green[/color] target.'
  } // end create

  update() {
    let current_trial = this.current_trial
    switch (this.state) {
    case states.INSTRUCT:
      if (this.entering) {
        this.entering = false
        let tt = current_trial.trial_type

        // show the right instruction text, wait until typing complete
        // and response made
        this.instructions.visible = true
        this.darkener.visible = true
        this.instructions.start(instruct_txts[tt], this.typing_speed)
        if (tt === 'instruct_basic') {
          this.examples.basic.visible = true
          this.examples.basic.play()
        } else if (tt === 'instruct_clamp' || tt === 'break') { //break isn't given but I may revisit this
          this.examples.clamp.visible = true
          this.examples.clamp.play()
        }
        this.instructions.typing.once('complete', () => {
          this.start_txt.visible = true
          this.input.once('pointerdown', () => {
            this.examples.basic.stop()
            this.examples.basic.visible = false
            this.examples.clamp.stop()
            this.examples.clamp.visible = false
            this.next_trial()
            this.darkener.visible = false
            this.instructions.visible = false
            this.instructions.text = ''
            this.start_txt.visible = false
          })
        })
      }
      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        this.target.visible = false
        this.center.fillColor = current_trial.target_color
        this.hold_val = 500
        this.hold_t = this.hold_val
        this.user_cursor.visible = true
        this.t_ref = window.performance.now()
      }
      if (Phaser.Geom.Circle.ContainsPoint(this.origin, this.user_cursor)) {
        this.hold_t -= this.game.loop.delta
        if (this.hold_t <= 0) {
          this.inter_trial_interval = window.performance.now() - this.t_ref
          this.raw_x = 0
          this.raw_y = 0
          this.extent = 0
          this.user_cursor.x = 0
          this.user_cursor.y = 0
          this.state = states.MOVING
          this.movement_data = []
        }
      } else {
        this.hold_t = this.hold_val
      }
      break
        case states.MOVING:
            // for non-probe trials, they control the cursor
            // for probe trials, there's a fixed cursor animation
            // that runs completely, regardless of what they do with the cursor
            // only thing they control on probe is initiation time
            if (this.entering) {
                this.entering = false
                this.reference_time = this.game.loop.now
                this.last_frame_time = this.game.loop.now
                this.dropped_frame_count = 0
                this.dts = []
                // every trial starts at 0, 0
                this.movement_data.splice(0, 0, {
                    evt_time: this.reference_time,
                    raw_x: 0,
                    raw_y: 0,
                    cursor_x: 0,
                    cursor_y: 0,
                    cursor_extent: 0,
                    cursor_angle: 0
                })
                if (current_trial.target_color == MAGENTA) {
                    this.rt_timer = 350
                } else {
                    this.rt_timer = 650
                }
                this.rt = 0;
                this.target.visible = true
                this.target.fillColor = current_trial.target_color
                TARGET_SIZE_RADIUS = current_trial.target_size
                this.target.radius = current_trial.target_size
                this.user_cursor.visible = current_trial.is_cursor_vis
                // let delay_frames = Math.round(this.game.user_config.refresh_rate_est * (0.001 * current_trial.delay))
                let delay_frames = 0

                if (current_trial.is_clamped) {
                    this.user_cursor.visible = false
                    this.fake_cursor.visible = current_trial.is_cursor_vis
                }
            } else { // second iter ++
                let est_dt = 1 / this.game.user_config.refresh_rate_est * 1000
                let this_dt = this.game.loop.now - this.last_frame_time
                this.rt_timer -= this_dt
                if (this.rt_timer <= 0 && Math.sqrt(Math.pow(this.user_cursor.x, 2) + Math.pow(this.user_cursor.y, 2))< 0.1 * TARGET_DISTANCE) {
                    this.target.fillColor = GRAY
                    this.center.fillColor = GRAY
                }
                if (Math.sqrt(Math.pow(this.user_cursor.x, 2) + Math.pow(this.user_cursor.y, 2)) < 0.1 * TARGET_DISTANCE)
                    this.rt += this_dt
                this.dropped_frame_count += this_dt > 1.5 * est_dt
                this.dts.push(this_dt)
                this.last_frame_time = this.game.loop.now
            }
            let real_extent = Math.sqrt(Math.pow(this.user_cursor.x, 2) + Math.pow(this.user_cursor.y, 2))


            if (real_extent >= 0.98 * TARGET_DISTANCE) {
                console.log(this.rt)
                this.state = states.POSTTRIAL
                this.user_cursor.visible = false //compute endpoint feedback
            }
            break;

    case states.POSTTRIAL:
      if (this.entering) {
        this.entering = false
        // deal with trial data
        let trial_data = {
          movement_data: this.movement_data,
          ref_time: this.reference_time,
          trial_number: this.trial_counter++,
          target_size_radius: TARGET_SIZE_RADIUS, // varies
          cursor_size_radius: CURSOR_SIZE_RADIUS,
          iti: this.inter_trial_interval, // amount of time between cursor appear & teleport
          hold_time: this.hold_val,
          dropped_frame_count: this.dropped_frame_count
        }
        let combo_data = merge_data(current_trial, trial_data)
        console.log(combo_data)
        let delay = 1200
        let fbdelay = 0
        // feedback about movement angle (if non-imagery)
        let first_element = trial_data.movement_data[1]
        let last_element = trial_data.movement_data[trial_data.movement_data.length - 1]
        let target_angle = current_trial.target_angle

        let reach_angles = this.movement_data.filter((a) => a.cursor_extent > 15).map((a) => a.cursor_angle)
        let end_angle = reach_angles.slice(-1)
        let norm_reach_angles = reach_angles.map((a) => signedAngleDeg(a, end_angle))
        let reaction_time = null
        let reach_time = null
        if (last_element && trial_data.movement_data.length > 2) {
          reaction_time = first_element.evt_time - this.reference_time
          reach_time = last_element.evt_time - first_element.evt_time
        }
        if (!(reaction_time === null)) {
          this.rts.push(reaction_time)
          this.movets.push(reach_time)
          if (current_trial.trial_type === 'practice_mask') {
            this.practice_mask_mts.push(reach_time)
          }
        }
        let punished = false
        let punish_delay = 3000
        let punish_flags = 0
        if (Math.abs(signedAngleDeg(last_element.cursor_angle, target_angle)) >= 30) {
          punish_flags |= Err.reached_away
          if (!punished) {
            punished = true
            this.other_warns.text = '[b]Make reaches toward\nthe target.[/b]'
          }
        }
        if ((current_trial.target_color == MAGENTA && reaction_time >= 350) || (current_trial.target_color == GREEN && reaction_time >= 650)) {
          punish_flags |= Err.late_start
          if (!punished) {
              punished = true
            this.other_warns.text = '[b]Please start the\nreach sooner.[/b]'
          }
        }
          if (current_trial.target_color == GREEN && reaction_time <= 450) {
              console.log(reaction_time)
              // too early!
              punish_flags |= Err.early_start
              if (!punished) {
                  punished = true
                  this.other_warns.text = '[b]Please plan your movements \n to the [color=#00ff00]green[/color] target \nbefore you start moving[/b]'
              }
          }

        if (reach_time >= 300) {
          // slow reach
          punish_flags |= Err.slow_reach
          if (!punished) {
            punished = true
            this.other_warns.text = '[b]Please move quickly\n through the target.[/b]'
          }
        }
        if (mad(norm_reach_angles) > 10) {
          // wiggly reach
          punish_flags |= Err.wiggly_reach
          if (!punished) {
              punished = true
            this.other_warns.text = '[b]Please make [color=yellow]straight[/color]\nreaches toward the target.[/b]'
          }
        }
        if (punished) {
          delay += punish_delay
            this.other_warns.visible = true

            this.target.fillColor = GRAY
            this.center.fillColor = GRAY
          this.time.delayedCall(punish_delay, () => {
            this.other_warns.visible = false
          })
        } else {
            //display the endpoint cursor
        }
        combo_data['delay_time'] = delay
        combo_data['reaction_time'] = reaction_time
        combo_data['reach_time'] = reach_time

        this.time.delayedCall(fbdelay, () => {
          this.time.delayedCall(delay, () => {
            combo_data['any_punishment'] = punished
            combo_data['punish_types'] = punish_flags
            // console.log(combo_data)
            this.all_data[current_trial.trial_type].push(combo_data)
            this.tmp_counter++
            this.raw_x = this.raw_y = this.user_cursor.x = this.user_cursor.y = CURSOR_RESTORE_POINT
            this.user_cursor.visible = true
            this.tweens.add({
              targets: this.user_cursor,
              scale: { from: 0, to: 1 },
              ease: 'Elastic',
              easeParams: [5, 0.5],
              duration: 800,
                onComplete: () => {
                this.target.visible = false
                this.next_trial()
              }
            })
          })
        })
      }
      break
    case states.END:
      if (this.entering) {
        this.entering = false
        this.input.mouse.releasePointerLock()
        document.removeEventListener('pointermove', this.ptr_cb, {passive: true, capture: true})
        // fade out
        this.tweens.addCounter({
          from: 255,
          to: 0,
          duration: 2000,
          onUpdate: (t) => {
            let v = Math.floor(t.getValue())
            this.cameras.main.setAlpha(v / 255)
          },
          onComplete: () => {
            // this.scene.start('QuestionScene', { question_number: 1, data: this.all_data })
            this.scene.start('EndScene', this.all_data)
          }
        })
      }
      break
    }
  } // end update

  get state() {
    return this._state
  }

  set state(newState) {
    this.entering = true
    this._state = newState
  }

  next_trial() {
    // move to the next trial, and set the state depending on trial_type
    if (this.tmp_counter > this.total_len) {
      this.progress.visible = false
    } else {
      this.progress.text = `${this.tmp_counter} / ${this.total_len}`
    }
    this.current_trial = this.trials.shift()
    let cur_trial = this.current_trial
    let tt = ''
    if (cur_trial !== undefined) {
      tt = cur_trial.trial_type
    }
    if (cur_trial === undefined || this.trials.length < 1 && tt.startsWith('break')) {
      this.state = states.END
    } else if (tt.startsWith('instruct_') || tt.startsWith('break')) {
      this.state = states.INSTRUCT
    } else if (
      tt.startsWith('practice') ||
      tt.startsWith('probe')
    ) {
      this.state = states.PRETRIAL
    } else {
      // undefine
      console.error('Oh no, wrong next_trial.')
    }
  }
}
