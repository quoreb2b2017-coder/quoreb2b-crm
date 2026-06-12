import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PersonalNote, PersonalNoteSchema } from './schemas/personal-note.schema';
import { PersonalNotesService } from './personal-notes.service';
import { PersonalNotesController } from './personal-notes.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PersonalNote.name, schema: PersonalNoteSchema }]),
  ],
  providers: [PersonalNotesService],
  controllers: [PersonalNotesController],
  exports: [PersonalNotesService],
})
export class PersonalNotesModule {}
