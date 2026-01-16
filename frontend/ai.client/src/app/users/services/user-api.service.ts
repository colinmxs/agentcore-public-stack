import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserSearchResponse } from '../../assistants/models/assistant.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserApiService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.appApiUrl}/users`;

  searchUsers(query: string, limit: number = 20): Observable<UserSearchResponse> {
    const params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString());
    
    return this.http.get<UserSearchResponse>(`${this.baseUrl}/search`, { params });
  }
}
