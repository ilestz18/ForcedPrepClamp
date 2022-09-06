/*
NB target distance is a constant in main
center sizes are consts in main


*/

/*
repeats (default 25) is number of repeats per clamp type
*/

export default function generateTrials(repeats = 25, CLAMP_ANGLE = 2, is_debug = false) {

    let reps = is_debug ? 1 : 10
    let out = []
    out.push({ trial_type: 'instruct_basic' }) // reach + q
    for (let i = 0; i < reps; i++) {
        var order = [1, 2, 3, 4]
        order = order.sort(() => Math.random() - 0.5) // random shuffle
        for (var j = 0; j < order.length; j++) {
            switch (order[j]) {
                case 1:
                    out.push({
                        trial_type: 'practice_basic',
                        is_clamped: false,
                        clamp_angle: 0,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0x00ff00
                    })
                    break;
                case 2:
                    out.push({
                        trial_type: 'practice_basic',
                        is_clamped: false,
                        clamp_angle: 0,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0x00ff00
                    })
                    break;
                case 3:
                    out.push({
                        trial_type: 'practice_basic',
                        is_clamped: false,
                        clamp_angle: 0,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0xff00ff
                    })
                    break;
                case 4:
                    out.push({
                        trial_type: 'practice_basic',
                        is_clamped: false,
                        clamp_angle: 0,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0xff00ff
                    })
            }
        }
    }
    out.push({ trial_type: 'instruct_clamp' })
    for (let i = 0; i < repeats; i++) {
        var order = []
        let good_order = false
        while (!good_order) {
            good_order = true
            order = [1, 2, 3, 4, 5, 6, 7, 8]
            order = order.sort(() => Math.random() - 0.5)
            let rots = []
            rots = order.map(function (t) {
                return t < 5
            })
            for (var j = 1; j < rots.length - 2; j++) {
                if (rots[j] == rots[j + 1] && rots[j] == rots[j + 2]) {
                    good_order = false
                }
            }
        }
        for (var j = 0; j < order.length; j++) {
            switch (order[j]) {
                case 1:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: true,
                        clamp_angle: CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0x00ff00
                    })
                    break;
                case 2:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0x00ff00
                    })
                    break;
                case 3:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0xff00ff
                    })
                    break;
                case 4:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0xff00ff
                    })
                    break;
                case 5:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: true,
                        clamp_angle: -1*CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0x00ff00
                    })
                    break;
                case 6:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: -1*CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0x00ff00
                    })
                    break;
                case 7:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: -1*CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 10,
                        target_color: 0xff00ff
                    })
                    break;
                case 8:
                    out.push({
                        trial_type: 'clamp',
                        is_clamped: false,
                        clamp_angle: -1*CLAMP_ANGLE,
                        is_cursor_vis: true,
                        show_feedback: true,
                        target_size: 20,
                        target_color: 0xff00ff
                    })
            }
        }
    }
    return out
}
