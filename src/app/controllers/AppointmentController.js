import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format } from 'date-fns';
import pt from 'date-fns/locale/pt';
import Appointment from '../models/Appointment';
import User from '../models/User';
import File from '../models/File';
import Notification from '../schemas/Notification';

class AppointmentController {
    async index(req, res) {
        const { userId: user_id } = req;
        const { page = 1 } = req.query;
        const appointments = await Appointment.findAll({
            where: {
                user_id,
                canceledAt: null,
            },
            attributes: ['id', 'date'],
            limit: 20,
            offset: (page - 1) * 20,
            order: ['date'],
            include: [
                {
                    model: User,
                    as: 'provider',
                    attributes: ['id', 'name'],
                    include: [
                        {
                            model: File,
                            as: 'avatar',
                            attributes: ['path', 'url'],
                        },
                    ],
                },
            ],
        });

        return res.json(appointments);
    }

    async store(req, res) {
        const schema = Yup.object().shape({
            date: Yup.date().required(),
            provider_id: Yup.number().required(),
        });

        if (!(await schema.isValid(req.body))) {
            return res
                .status(400)
                .json({ error: 'Something is wrong with request' });
        }

        const { date, provider_id } = req.body;
        const { userId: user_id } = req;

        /*
         * Check if a provider is trying to make an 
         appointment for himself
         */

        if (provider_id === user_id) {
            return res
                .status(400)
                .json({ error: 'User and Providers cannot be the same' });
        }

        /*
         * Check provider
         */

        const { provider } = await User.findByPk(provider_id);
        if (!provider) {
            return res
                .status(400)
                .json({ error: 'User selected is not a provider' });
        }

        /*
         * Check for past hours
         */

        const hourStart = startOfHour(parseISO(date));

        if (isBefore(hourStart, new Date())) {
            return res
                .status(400)
                .json({ error: 'Past dates are not allowed' });
        }

        /*
         * Check if the hour is avaliable
         */

        const checkAvailability = await Appointment.findOne({
            where: {
                provider_id,
                canceledAt: null,
                date: hourStart,
            },
        });

        if (checkAvailability) {
            return res.status(400).json({ error: 'Date is not avaliable' });
        }

        const appointment = await Appointment.create({
            date: hourStart,
            user_id,
            provider_id,
        });

        /*
         * Notify appointment provider
         */

        const user = await User.findByPk(user_id);

        const formattedDate = format(hourStart, "dd 'de 'MMMM', às' H:mm ", {
            locale: pt,
        });

        await Notification.create({
            content: `Novo agendamento de ${user.name} para o dia ${formattedDate}`,
            user: provider_id,
        });

        return res.json(appointment);
    }
}
export default new AppointmentController();