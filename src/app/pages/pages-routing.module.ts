import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';

import { PagesComponent } from './pages.component';
import { NotFoundComponent } from './miscellaneous/not-found/not-found.component';
import { ListComponent } from './repositories/list/list.component';
import { AddComponent } from './repositories/add/add.component';
import { EditComponent } from './repositories/edit/edit.component';


const routes: Routes = [{
  path: '',
  component: PagesComponent,
  children: [{
    path: 'repositories',
    component: ListComponent,
  }, {
    path: 'add-repository',
    component: AddComponent,
  }, {
    path: 'repository/:id',
    component: EditComponent,
  }, {
    path: 'miscellaneous',
    loadChildren: './miscellaneous/miscellaneous.module#MiscellaneousModule',
  }, {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  }, {
    path: '**',
    component: NotFoundComponent,
  }],
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {
}